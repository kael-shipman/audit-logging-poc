import { UserAttributes, Api } from "api";
import {
  JsonApiResponseDocWithoutErrors,
  JsonApiResponseDocWithErrors,
  JsonApiError,
} from "audit-types";

class JsonApiResponseError extends Error {
  public code = "JsonApiResponseError";

  constructor(msg: string, public readonly jsonApiDoc: JsonApiResponseDocWithErrors) {
    super(msg);
  }
}

const isJsonApiResponseError = function(e: any): e is JsonApiResponseError {
  return e.code && e.code === "JsonApiResponseError";
}






const refreshToken = async function(userId: string|number): Promise<string> {
  const response = await fetch(`http://localhost:3000/tokens/${userId}`);
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Couldn't fetch access token: ${text}`);
  }
  return text;
}

const fetchWithToken = async function<T>(url: string, options: any = {}): Promise<T|null> {
  if (!options) {
    options = {};
  }
  if (!options.headers) {
    options.headers = {};
  }
  if (!options.headers.Authorization) {
    options.headers.Authorization = `Bearer ${token}`;
  }

  const res: Promise<T|null> = new Promise((resolve, reject) => {
    fetch(url, options)
    .then((res: Response): any => {
      if (res.ok) {
        res.text().then((text) => {
          if (text) {
            resolve(<T>JSON.parse(text));
          } else {
            resolve(null);
          }
        });
      } else {
        if (res.status === 403) {
          refreshToken(1)
          .then((t: string) => {
            token = t;
            fetch(url, options)
            .then((res2: Response) => {
              if (res2.ok) {
                res2.text().then((text) => {
                  if (text) {
                    resolve(<T>JSON.parse(text));
                  } else {
                    resolve(null);
                  }
                });
              } else {
                res2.text().then((text: string) => {
                  reject(new JsonApiResponseError(
                    `Couldn't execute request. Received response code ` +
                    `${res2.status} with body ${text}`,
                    JSON.parse(text)
                  ));
                });
              }
            });
          })
          .catch((e) => {
            reject(e);
          })
        } else {
          res.text().then((text: string) => {
            reject(new JsonApiResponseError(
              `Couldn't execute request. Received response code ` +
              `${res.status} with body ${text}`,
              JSON.parse(text)
            ));
          });
        }
      }
    });
  });

  return res;
}

const handleError = function(e: NodeJS.ErrnoException|JsonApiResponseError): void {
  console.error(e);
  let msg: string;
  if (isJsonApiResponseError(e)) {
    msg = `There was an error getting users: ${
      e.jsonApiDoc.errors
      .map((e: JsonApiError) => `${e.title}: ${e.detail}`)
      .join("\n")
    }`
  } else {
    msg = `There was an error getting users: ${e.message}`;
  }
  alert(msg);
}

const getUsers = async function(token: string): Promise<Array<Api.User>> {
  try {
    const doc = await fetchWithToken<JsonApiResponseDocWithoutErrors>("http://localhost:3000/api/users");
    return <Array<Api.User>>doc!.data;
  } catch (e) {
    handleError(e);
    return [];
  }
}

const buildUsersTable = function(users: Array<Api.User>, container: HTMLElement) {
  // Reset content
  container.innerHTML = '<div class="header col1">id</div>' +
    '<div class="header col2">name</div><div class="header col3">email</div>' +
    '<div class="header col4">TOS</div><div class="header col5">action</div>';

  // Add rows
  for (let i = 0; i < users.length; i++) {
    const row = buildUserRow(users[i]);
    for (let j = 0; j < row.length; j++) {
      container.appendChild(row[j]);
    }
  }
}

const buildUserRow = function(user: Api.User): Array<HTMLElement> {
  const row: Array<HTMLElement> = [];
  const spec: Array<[ string, string ]> = [
    [ "id", String(user.id) ],
    [ "name", user.attributes.name ],
    [ "email", user.attributes.email ],
    [ "agreedTos", `<input type="checkbox" ${
      user.attributes.agreedTos ? 'checked="checked"' : ""
    } data-userId="${user.id}">` ],
    [
      "control",
      `<button data-userId="${user.id}">edit</button>` +
      `<button data-userId="${user.id}">save</button>` +
      `<button data-userId="${user.id}">delete</button>`
    ],
  ];
  for (let i = 0; i < spec.length; i++) {
    const el = document.createElement("div");
    el.className = `col${i+1}`;
    el.setAttribute("data-userId", String(user.id));
    el.id = `users:${user.id}-${spec[i][0]}`;
    el.innerHTML = spec[i][1];

    if (spec[i][0] === "agreedTos") {
      el.getElementsByTagName("input")[0]!.addEventListener("change", function(ev) {
        if (ev && ev.target) {
          toggleAgreement(
            (ev.target as HTMLElement).getAttribute("data-userId")!,
            (ev.target as HTMLInputElement).checked
          );
        }
      });
    }

    if (spec[i][0] === "control") {
      const buttons = el.getElementsByTagName("button");
      buttons[0]!.addEventListener("click", function(ev) { editUserRow(String(user.id)); });
      buttons[1]!.addEventListener("click", function(ev) { saveUserRow(String(user.id)); });
      buttons[2]!.addEventListener("click", function(ev) { deleteUserRow(String(user.id)); });

      (el as any).editButton = buttons[0];
      (el as any).saveButton = buttons[1];
      (el as any).deleteButton = buttons[2];

      el.removeChild(buttons[1]);
    }

    row.push(el);
  }
  return row;
}

const toggleAgreement = async function(userId: string, agreed: boolean) {
  console.log(userId, agreed);
  try {
    await fetchWithToken<Api.User>("http://localhost:3000/api/users/"+userId, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/vnd.api+json",
      },
      body: JSON.stringify({
        data: {
          type: "users",
          id: userId,
          attributes: {
            agreedTos: agreed ? 1 : 0
          }
        }
      })
    })
  } catch (e) {
    handleError(e);
  }
}

const editUserRow = function(userId: string) {
  console.log("Editing user row for user " + userId);

  const name = document.getElementById(`users:${userId}-name`);
  if (name) {
    const nameInput = document.createElement("input");
    nameInput.type = "text";
    nameInput.value = name.innerHTML;
    name.innerHTML = "";
    name.appendChild(nameInput);
  }

  const email = document.getElementById(`users:${userId}-email`);
  if (email) {
    const emailInput = document.createElement("input");
    emailInput.type = "email";
    emailInput.value = email!.innerHTML;
    email.innerHTML = "";
    email.appendChild(emailInput);
  }

  const edit = document.getElementById(`users:${userId}-control`);
  if (edit) {
    edit.removeChild((edit as any).editButton);
    edit.removeChild((edit as any).deleteButton);
    edit.appendChild((edit as any).saveButton);
    (edit as any).saveButton.disabled = false;
  }
}

const saveUserRow = async function(userId: string) {
  console.log("Saving user row for user " + userId);

  const data: Partial<UserAttributes> = {
  }

  const name = document.getElementById(`users:${userId}-name`);
  if (name) {
    const input = name.getElementsByTagName("input")![0];
    name.innerHTML = input.value;
    data.name = input.value;
  }

  const email = document.getElementById(`users:${userId}-email`);
  if (email) {
    const input = email.getElementsByTagName("input")![0];
    email.innerHTML = input.value;
    data.email = input.value;
  }

  const edit = document.getElementById(`users:${userId}-control`);
  if (edit) {
    (edit as any).saveButton.disabled = true;
  }

  try {
    await fetchWithToken<JsonApiResponseDocWithoutErrors>(`http://localhost:3000/api/users/${userId}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/vnd.api+json"
      },
      body: JSON.stringify({
        data: {
          id: userId,
          type: "users",
          attributes: data
        }
      })
    });

    if (edit) {
      edit.appendChild((edit as any).editButton);
      edit.appendChild((edit as any).deleteButton);
      edit.removeChild((edit as any).saveButton);
      (edit as any).deleteButton.disabled = false;
    }
  } catch (e) {
    (edit as any).saveButton.disabled = false;
    handleError(e);
  }
}

const deleteUserRow = async function(userId: string|number) {
  if (userId == 1) {
    alert("You can't delete user 1. Try a different user.");
    return;
  }

  console.log("Deleting user " + userId);

  const edit = document.getElementById(`users:${userId}-control`);

  try {
    (edit as any).deleteButton.disabled = true;
    await fetchWithToken<null>(`http://localhost:3000/api/users/${userId}`, {
      method: "DELETE"
    })

    const usersList = document.getElementById("users-list");
    if (usersList) {
      const userCells = usersList.querySelectorAll("[data-userId='"+userId+"']");
      if (userCells) {
        for (let i = 0; i < userCells.length; i++) {
          console.log(userCells[i].id);
          usersList.removeChild(userCells[i]);
        }
      }
    }
  } catch (e) {
    handleError(e);
  }
  (edit as any).deleteButton.disabled = false;
}







let token: string = "";
window.addEventListener("DOMContentLoaded", async function(ev) {
  token = await refreshToken(1);
  const users = getUsers(token);
  buildUsersTable(await users, document.getElementById("users-list")!);
});

