import * as amqp from "amqplib";

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
    return ch.consume(queue, (msg: amqp.Message|null) => {
      if (msg) {
        console.log(msg.content.toString("utf8"));
        ch.ack(msg);
      }
    });
  })
});



