import * as amqp from "amqplib";
import { DataEvent } from "audit-types";
import * as Mysql from "mysql";

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
          const ev = <DataEvent>JSON.parse(msg.content.toString("utf8"));

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



