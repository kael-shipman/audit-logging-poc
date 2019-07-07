import * as express from "express";
import * as jwt from "jsonwebtoken";
import * as Mysql from "mysql";
import * as fs from "fs";
import * as amqp from "amqplib";
import {
  TimelessChangeEvent,
  TimelessDataEventAttributes,
  DataEventAttributes,
  JsonApiRequestDoc,
  JsonApiResponseDocWithoutErrors,
  JsonApiData,
} from "audit-types";

/**
 * 1. curl http://localhost:3000/token/1
 *    -> Returns a JWT with 20-min expiry
 * 2. curl -H "Authorization: Bearer $TOKEN" http://localhost:3000/api/users/1
 * 3. curl -H "Content-Type: application/json" -H "Authorization: Bearer $TOKEN" -X PATCH -d '{"data":{"id":1,"type":"users","attributes":{"name":"Kael Shipman","agreedTos":1}}}' http://localhost:3000/api/users/1
 * 4. curl -H "Content-Type: application/json" -H "Authorization: Bearer $TOKEN" -d '{"data":{"type":"users","attributes":{"name":"Ray Charles","agreedTos":0,"email":"ray.charles@openfinance.io"}}}' http://localhost:3000/api/users
 * 5. curl -H "Content-Type: application/json" -H "Authorization: Bearer $TOKEN" -X PATCH -d '{"data":{"id":2,"type":"users","attributes":{"agreedTos":1}}}' http://localhost:3000/api/users/2
 * 6. curl -H "Authorization: Bearer $TOKEN" -X DELETE http://localhost:3000/api/users/2
 * 7. curl http://localhost:3000/logs/by/users/1
 *    -> Returns all actions that user 1 has done
 * 6. curl http://localhost:3000/logs/for/users/2
 *    -> Returns all actions done to user 2
 */


export interface UserAttributes {
  name: string;
  email: string;
  agreedTos: boolean;
}

export interface NoteAttributes {
  timestamp: number;
  targetType: string;
  targetId: number;
  fieldName: string|null;
  data: string;
  creatorId: number;
}

export namespace Db {
  export interface User extends UserAttributes {
    id: number;
  }

  export interface Note extends NoteAttributes {
    id: number;
  }
}

export namespace Api {
  export interface User extends JsonApiData {
    type: "users";
    attributes: UserAttributes;
  }
  export interface Note extends JsonApiData {
    type: "notes";
    attribute: NoteAttributes;
  }
}



const app = express();

const authPrivKey = fs.readFileSync("./auth.rsa");
const authPubKey = fs.readFileSync("./auth.rsa.pub");

const mysql = Mysql.createConnection({
  host: "localhost",
  user: "dev",
  password: "dev",
  database: "audit-logging-api"
});

const query = function<A extends {}>(
  query: string,
  params?: Array<string|number|boolean|null>
): Promise<A> {
  return new Promise((resolve, reject) => {
    mysql.query(query, params, (error, results, fields) => {
      if (error !== null) {
        reject(error);
      } else {
        resolve(results);
      }
    });
  });
}

const amqpCnx: Promise<amqp.Channel> = amqp.connect({
  hostname: "localhost",
  port: 5672,
  vhost: "dev",
  username: "dev",
  password: "dev"
})
.then((conn: amqp.Connection) => { return conn.createChannel(); })
.then((ch: amqp.Channel) => {
  const promises: Array<Promise<unknown>> = [];
  promises.push(ch.assertExchange("api-stream", "topic", { durable: false, }));
  return Promise.all(promises).then((results) => ch);
});

const emit = async function(ev: TimelessDataEventAttributes): Promise<void> {
  ev.timestamp = ev.timestamp || Date.now();
  const mq = await amqpCnx;
  mq.publish("api-stream", "api.data.mutated", Buffer.from(JSON.stringify(ev as DataEventAttributes), "utf8"));
}

const diffData = function<A>(existing: A, incoming: Partial<A>): Partial<A> {
  const diff: Partial<A> = {};
  for(let f in incoming) {
    if (f === "id") {
      continue;
    }
    if (typeof existing[f] === "undefined") {
      const e = <NodeJS.ErrnoException>new Error(`Objects don't appear to be of the same type. Field ${f} in incoming object not found in existing object`);
      e.code = "InvalidField"
      throw e;
    }
    if (
      incoming[f] !== existing[f] &&
      (
        (
          typeof incoming[f] !== "boolean" &&
          typeof existing[f] !== "boolean"
        ) ||
        incoming[f] != existing[f]
      )
    ) {
      diff[f] = incoming[f];
    }
  }
  return diff;
}

const isJsonApiDoc = function(envelop: any): envelop is JsonApiRequestDoc {
  return envelop.data && envelop.data.type;
}

const validateBody = function(res: express.Response, body: any): body is JsonApiRequestDoc {
  if (!isJsonApiDoc(body)) {
    returnError(res, 400, "Invalid Body", "Body must be a JSON:API document");
    return false;
  } else {
    return true;
  }
}

const toJsonApi = function<T extends JsonApiData>(attrs: any, type: string): T {
  const obj: JsonApiData = {
    id: attrs.id,
    type,
    attributes: attrs
  }
  if (obj.attributes) {
    delete (obj.attributes as any).id;
  }
  return obj as T;
}

const returnError = function(
  res: express.Response,
  status: number,
  title: string,
  detail: string
) {
  return res
  .set("Access-Control-Allow-Origin", "*")
  .status(status)
  .send(JSON.stringify({
    errors: [ { title, detail } ]
  }));
}



// Allow all CORS requests

app.options("*", (req, res, next) => {
  res
  .set("Access-Control-Allow-Origin", "*")
  .set("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS")
  .set("Access-Control-Allow-Headers", "Content-Type, Authorization")
  .send();
});




// Allow people to get access tokens

app.get("/tokens/:id", async (req, res, next) => {
  if (!req.params.id) {
    return returnError(
      res,
      400,
      "Missing ID",
      "You must send the ID of the user whose token you'd like to obtain"
    );
  }

  const user = await query<Array<Db.User>>("SELECT * FROM `users` WHERE `id` = ?", [ req.params.id ]);
  if (user.length === 0) {
    return returnError(res, 400, "Invalid ID", "The User ID you passed is not valid");
  }

  const token = jwt.sign(
    { 
      id: user[0].id,
      name: user[0].name,
      email: user[0].email,
      agreedTos: user[0].agreedTos
    },
    authPrivKey,
    {
      algorithm: "RS256",
      expiresIn: 60*20,
      issuer: "localhost",
    }
  );

  res
    .set("Content-Type", "text/plain")
    .set("Access-Control-Allow-Origin", "*")
    .status(201)
    .send(token);
});






// Require access tokens for all further requests

app.use((req, res, next) => {
  const authHeader = req.get("Authorization");
  if (!authHeader) {
    return returnError(res, 403, "Missing Auth Header",
      "Please supply a valid 'Authorization' header with Bearer token."
    );
  }

  let token: string|null = null;
  for (let auth of authHeader.split(",")) {
    const pieces = auth.split(" ");
    const type = pieces.shift();
    if (type && type.toLowerCase() === "bearer") {
      token = pieces.join(" ");
      break;
    }
  }

  if (!token) {
    return returnError(res, 403, "Auth Header Invalid",
      "Please supply a valid 'Authorization' header with Bearer token."
    );
  }

  try {
    const user = jwt.verify(token, authPubKey, { algorithms: [ "RS256" ] });
    req.app.locals.user = user;
    next();
  } catch(e) {
    console.error(e);
    return returnError(res, 401, "Bad Auth Token", e.message || "Unknown error");
  }
});


// Parse json bodies
app.use(express.json({
  type: [ "application/json", "application/vnd.api+json" ]
}));









// General endpoints

app.delete("/api/:type/:id", async (req, res, next) => {
  const whitelist = [ "users", "notes" ];
  if (whitelist.indexOf(req.params.type) === -1) {
    return returnError(
      res,
      400,
      "Unrecognized Type",
      `You passed ${req.params.type}, but the acceptable types are '${whitelist.join("', '")}'`
    );
  }

  try {
    const result = await query<{affectedRows: number;}>(
      "DELETE FROM `"+req.params.type+"` WHERE `id` = ?",
      [ req.params.id ]
    );

    if (result.affectedRows > 0) {
      emit({
        action: "deleted",
        actorType: "users",
        actorId: req.app.locals.user.id,
        targetType: req.params.type,
        targetId: req.params.id,
      });
    }

    res
    .status(200)
    .set("Access-Control-Allow-Origin", "*")
    .send();
  } catch (e) {
    console.error(e);
    return returnError(res, 500, "Internal Service Error", "Sorry, something went wrong");
  }
});








// User endpoints

app.get(["/api/users", "/api/users/:id"], async (req, res, next) => {
  let users: Array<Db.User>;
  if (req.params.id) {
    users = await query<Array<Db.User>>("SELECT * FROM `users` WHERE `id` = ?", [ req.params.id ]);
    if (users.length === 0) {
      return returnError(res, 404, "Invalid ID", "The User ID you passed is not valid");
    }
  } else {
    users = await query<Array<Db.User>>("SELECT * FROM `users`");
  }

  const userObjects: Array<Api.User> = [];
  for (let i = 0; i < users.length; i++) {
    emit({
      action: "viewed",
      actorType: "users",
      actorId: req.app.locals.user.id,
      targetType: "users",
      targetId: users[i].id,
    });
    userObjects.push(toJsonApi<Api.User>(Object.assign({}, users[i]), "users"));
  }

  const doc: JsonApiResponseDocWithoutErrors = {
    data: req.params.id ? userObjects[0] : userObjects
  };

  res
  .set("Access-Control-Allow-Origin", "*")
  .set("Content-Type", "application/vnd.api+json")
  .status(200)
  .send(JSON.stringify(doc));
});

app.post("/api/users", async (req, res, next) => {
  if (!validateBody(res, req.body)) {
    return;
  }

  const userData = <UserAttributes>req.body.data.attributes;

  // validate here (later)

  try {
    const result = await query<{insertId: number;}>(
      "INSERT INTO `users` VALUES(NULL, ?, ?, ?)",
      [
        userData.name || null,
        userData.email || null,
        userData.agreedTos || 0
      ]
    );

    emit({
      action: "created",
      actorType: "users",
      actorId: req.app.locals.user.id,
      targetType: "users",
      targetId: result.insertId,
    });

    const doc = {
      data: {
        id: result.insertId,
        type: "users",
        attributes: Object.assign({}, userData)
      }
    };

    res
    .set("Access-Control-Allow-Origin", "*")
    .set("Content-Type", "application/vnd.api+json")
    .status(201)
    .send(JSON.stringify(doc));
  } catch (e) {
    console.error(e);
    return returnError(res, 500, "Internal Service Error", "Sorry, something went wrong");
  }
});


app.patch("/api/users/:id", async (req, res, next) => {
  if (!validateBody(res, req.body)) {
    return;
  }

  const userData = <Partial<UserAttributes>>req.body.data.attributes;

  // validate here (later)

  try {
    const existingUsers = await query<Array<Db.User>>(
      "SELECT * FROM `users` WHERE `id` = ?",
      [ req.params.id ]
    );

    if (existingUsers.length === 0) {
      return returnError(res, 404, "Invalid ID", "The User ID you passed is not valid");
    }

    // Diff the incoming data against the existing data
    const existingUser = existingUsers[0];
    const diff = diffData<Db.User>(existingUser, userData);
    const events: Array<TimelessChangeEvent> = [];
    const fields: Array<string> = [];
    const vals: Array<string|number|boolean|null> = [];

    // For each changed field, create a query record and an event
    for (let field in diff) {
      const f = <keyof Db.User>field
      fields.push(`\`${f}\` = ?`);
      vals.push((diff as any)[f]);
      events.push({
        action: "changed",
        actorType: "users",
        actorId: req.app.locals.user.id,
        targetType: "users",
        targetId: req.params.id,
        fieldName: f,
        prevData: existingUser[f],
        newData: diff[f]
      });
    }

    vals.push(req.params.id);

    let finalUserData: Db.User;
    if (fields.length === 0) {
      // Register view event here and just return the user
      // TODO: register view event
      finalUserData = existingUser;
    } else {
      await query<{affectedRows: number}>(
        "UPDATE `users` SET " + fields.join(", ") + " WHERE `id` = ?",
        vals
      );
      finalUserData = <Db.User>Object.assign({}, existingUser, diff);
      for (let i = 0; i < events.length; i++) {
        emit(events[i]);
      }
    }

    const doc = {
      data: {
        id: req.params.id,
        type: "users",
        attributes: Object.assign({}, finalUserData)
      }
    };
    delete doc.data.attributes.id;

    res
    .set("Access-Control-Allow-Origin", "*")
    .set("Content-Type", "application/vnd.api+json")
    .status(200)
    .send(JSON.stringify(doc));
  } catch (e) {
    e = <NodeJS.ErrnoException>e;
    console.error(e);
    if (e.code === "InvalidField") {
      return returnError(res, 400, "Invalid Data", e.message);
    } else {
      return returnError(res, 500, "Internal Service Error", "Sorry, something went wrong");
    }
  }
});







// Notes endpoints

app.post("/api/notes", async (req, res, next) => {
  if (!validateBody(res, req.body)) {
    return;
  }

  const noteData = <NoteAttributes>req.body.data.attributes;

  // validate here (later)

  try {
    const result = await query<{insertId: number;}>(
      "INSERT INTO `notes` VALUES (NULL, ?, ?, ?, ?, ?, ?)",
      [
        Date.now(),
        noteData.targetType,
        noteData.targetId,
        noteData.fieldName,
        noteData.data,
        req.app.locals.user.id,
      ]
    );

    emit({
      action: "created",
      actorType: "users",
      actorId: req.app.locals.user.id,
      targetType: "notes",
      targetId: result.insertId,
    });

    const doc = {
      data: {
        id: result.insertId,
        type: "notes",
        attributes: Object.assign({}, noteData)
      }
    };

    res
    .set("Access-Control-Allow-Origin", "*")
    .set("Content-Type", "application/vnd.api+json")
    .status(201)
    .send(JSON.stringify(doc));
  } catch (e) {
    console.error(e);
    return returnError(res, 500, "Internal Service Error", "Sorry, something went wrong");
  }
});


app.get([ "/api/notes", "/api/notes/:id" ], async (req, res, next) => {
  let where: string;
  let params: Array<string|number|null> = [];

  if (req.params.id) {
    if (req.query.target) {
      return returnError(
        res,
        400,
        "Too Many Parameters",
        `Looks like you've passed both id and target parameters. ` +
        `You pass one or the other, but not both`
      );
    }

    where = "`id` = ?";
    params.push(req.params.id);
  } else {
    if (!req.query.target) {
      return returnError(
        res,
        400,
        "Not Enough Parameters",
        "You must pass either a note id via the url or a 'target' query " +
        "parameter (e.g., `target=users:1`). You passed neither."
      );
    }

    const target = req.query.target.split(":");
    if (target.length < 2 || target.length > 3) {
      return returnError(
        res,
        400,
        "Invalid Value for 'target'",
        `The 'target' parameter must be of the form 'type:id(:field)'. You passed ${req.query.target}`
      );
    }

    where = "`targetType` = ? && `targetId` = ?";
    params.push(target[0]);
    params.push(target[1]);

    if (params.length === 3) {
      where += " && `fieldName` = ?";
      params.push(target[2]);
    }
  }

  try {
    const notes = await query<Array<Db.Note>>("SELECT * FROM `notes` WHERE " + where, params);
    if (notes.length === 0) {
      return returnError(res, 404, "No Notes Found", "Couldn't find notes matching your search parameters.");
    }

    const notesObjects: Array<Api.Note> = [];
    for (let i = 0; i < notes.length; i++) {
      emit({
        action: "viewed",
        actorType: "users",
        actorId: req.app.locals.user.id,
        targetType: "notes",
        targetId: notes[i].id,
      });
      notesObjects.push(toJsonApi<Api.Note>(Object.assign({}, notes[i]), "notes"));
    }

    let doc: JsonApiResponseDocWithoutErrors = {
      data: req.params.id ? notesObjects[0] : notesObjects
    };

    res
    .set("Access-Control-Allow-Origin", "*")
    .set("Content-Type", "application/vnd.api+json")
    .status(200)
    .send(JSON.stringify(doc));
  } catch (e) {
    console.error(e);
    return returnError(
      res,
      500,
      "Internal Server Error",
      "Sorry, something went wrong while processing your request."
    );
  }
});










const port=3000;
app.listen(port);
console.log(`Listening on ${port}`);

