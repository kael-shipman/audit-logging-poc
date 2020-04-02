import * as amqp from "amqplib";
import {
  TimelessChangeEvent,
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
  vhost: "/",
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

          // Insert row
          const result = await query<{ insertId: number }>(
            "INSERT INTO `data-events` " +
            "(`action`, `timestamp`, `actorType`, `actorId`, `targetType`, `targetId`, `eventName`) " +
            "VALUES (?,?,?,?,?,?,?)",
            params
          );

          // Fill in the change-specific parameters
          if (ev.action === "changed") {
            const p: Array<Promise<unknown>> = [];
            for (let k in ev.changes) {
              p.push(query(
                "INSERT INTO `data-mutations` (`eventId`, `fieldName`, `prev`, `next`) " +
                "VALUES (?, ?, ?, ?)",
                [
                  result.insertId,
                  k,
                  JSON.stringify(ev.changes[k].prev),
                  JSON.stringify(ev.changes[k].next)
                ]
              ));
            }
            await Promise.all(p);
          }

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

const isChangeEvent = (e: any): e is TimelessChangeEvent => e.action === "changed";









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
  const events = await query<Array<Db.DataEvent>>(
    "SELECT * FROM `data-events` WHERE `targetType` = ? && `targetId` = ?",
    [ req.params.targetType, req.params.targetId ]
  );

  const result: Array<Api.DataEvent> = [];
  if (events && events.length > 0) {
    const mutations = await query<Array<{ eventId: number; fieldName: string; prev: string; next: string; }>>(
      "SELECT * FROM `data-mutations` WHERE `eventId` IN (" + events.map(e => "?").join(",") + ")",
      events.map(e => e.id)
    );

    for(let i = 0; i < events.length; i++) {
      const event = events[i];
      const id = event.id;
      if (isChangeEvent(event)) {
        event.changes = mutations
          .filter(v => v.eventId === id)
          .reduce(
            (targ, val) => {
              targ[val.fieldName] = {
                prev: val.prev ? JSON.parse(val.prev) : null,
                next: val.next ? JSON.parse(val.next) : null,
              };
              return targ;
            },
            {} as TimelessChangeEvent["changes"]
          );
      }
      delete event.id;
      result.push({
        id,
        type: "data-events",
        attributes: event,
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

