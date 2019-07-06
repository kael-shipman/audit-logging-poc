import * as express from "express";
import * as path from "path";

const app = express();

app.all("*", (req, res, next) => {
  console.log("Handling request for " + req.path);
  // Default to index.html
  const fn = req.path === "/" ? "/index.html" : req.path;
  console.log(`fn: ${fn}`);

  const opts = {
    root: path.join(process.env.PWD || "./", "public"),
    dotfiles: "deny"
  };

  // First try to send the file
  console.log(`Attempting to send file`);
  res.sendFile(
    `.${fn}`,
    opts,
    (err) => {
      if (err) {
        console.error(err);

        if ((err as NodeJS.ErrnoException).code === "ENOENT") {
          // If file not found and specific file requested, return 404
          if (fn !== "/index.html" && fn.match(/\.[a-zA-Z]{1,20}$/)) {
            res.status(404).send();
          } else {
            // If no file specifically requested, just send the index file
            res.sendFile(
              "./index.html",
              opts,
              (err2) => {
                if (err2) {
                  console.error(err2);
                  res
                  .set("Content-Type", "application/json")
                  .status(500)
                  .send(JSON.stringify({
                    errors: [
                      {
                        title: "Internal Server Error",
                        detail: "Sorry, something went wrong on our end.",
                        status: 500,
                      }
                    ]
                  }));
                }
              }
            );
          }
        } else {
          // Otherwise, it's a real error
          res
          .set("Content-Type", "application/json")
          .status(500)
          .send(JSON.stringify({
            errors: [
              {
                title: "Internal Server Error",
                detail: "Sorry, something went wrong on our end.",
                status: 500,
              }
            ]
          }));
        }
      }
    }
  );
});

app.listen("3002");
console.log("Listening on 3002");
