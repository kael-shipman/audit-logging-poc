import * as amqp from "amqplib";
import {
  DataEventAttributes,
  Db,
  Api,
} from "audit-types";
import * as Mysql from "mysql";
import * as express from "express";

const mysql = Mysql.createConnection({
  host: "localhost",
  user: "dev",
  password: "dev",
  database: "audit-logging-auditor"
});

const query = function<A extends {}>(
  query: string,
  params?: Array<string|number|boolean|null>
): Promise<Array<A>> {
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
.then((conn: amqp.Connection) => { return conn.createChannel(); });

// Consume messages and output to screen
amqpCnx.then((ch: amqp.Channel) => {
  const queue = "data-mutation-audits";
  ch.assertQueue(queue, { durable: false, })
  .then(() => {
    return ch.bindQueue(queue, "api-stream", "*.data.mutated");
  })
  .then(() => {
    return ch.consume(queue, async (msg: amqp.Message|null) => {
      if (msg) {
        try {
          // Inflate the data event
          const ev = <DataEventAttributes>JSON.parse(msg.content.toString("utf8"));

          // Fill in the common parameters
          let params: Array<string|number|boolean|null> = [
            ev.action,
            ev.timestamp,
            ev.actorType,
            ev.actorId,
            ev.targetType,
            ev.targetId,
            ev.eventName || null,
          ];

          // Fill in the change-specific parameters
          if (ev.action === "changed") {
            params = params.concat([
              typeof ev.fieldName === "undefined" ? null : ev.fieldName,
              typeof ev.prevData === "undefined" ? null : ev.prevData,
              typeof ev.newData === "undefined" ? null : ev.newData,
            ]);
          } else {
            params = params.concat([null,null,null]);
          }

          // Insert row
          await query(
            "INSERT INTO `data-events` " +
            "(`action`, `timestamp`, `actorType`, `actorId`, `targetType`, `targetId`, `eventName`, `fieldName`, `prevData`, `newData`) " +
            "VALUES (?,?,?,?,?,?,?,?,?,?)",
            params
          );

          // Ack message
          ch.ack(msg);
        } catch (e) {
          console.error(e);
          ch.nack(msg);
        }
      }
    });
  })
});









// API

const app = express();

// Allow all CORS requests

app.options("*", (req, res, next) => {
  res
  .set("Access-Control-Allow-Origin", "*")
  .set("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS")
  .set("Access-Control-Allow-Headers", "Content-Type, Authorization")
  .send();
});


app.get("/api/:targetType/:targetId/data-events", async (req, res, next) => {
  const events = await query<Db.DataEvent>(
    "SELECT * FROM `data-events` WHERE `targetType` = ? && `targetId` = ?",
    [ req.params.targetType, req.params.targetId ]
  );

  const result: Array<Api.DataEvent> = [];
  if (events && events.length > 0) {
    for(let i = 0; i < events.length; i++) {
      const id = events[i].id;
      delete events[i].id;
      result.push({
        id,
        type: "data-events",
        attributes: events[i],
      });
    }
  }

  res
  .set("Access-Control-Allow-Origin", "*")
  .set("Content-Type", "application/vnd.api+json")
  .status(200)
  .send(JSON.stringify({ data: result }));
});

app.listen(3001);
console.log("Listening on 3001");

