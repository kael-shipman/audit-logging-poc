import { UserAttributes, Api } from "api";
import {
  JsonApiResponseDocWithoutErrors,
  JsonApiResponseDocWithErrors,
  JsonApiError,
  Api as EventsApi,
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
  container.innerHTML = '<div class="header cell1">id</div>' +
    '<div class="header cell2">name</div><div class="header cell3">email</div>' +
    '<div class="header cell4">TOS</div><div class="header cell5">action</div>';

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
    [ "log", "" ],
  ];
  for (let i = 0; i < spec.length; i++) {
    const el = document.createElement("div");
    el.className = `cell${i+1}`;
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

    new Promise(async (resolve, reject) => {
      const history = await getObjectHistory("users", user.id);
      showObjectHistory(user.id, history);
      resolve();
    });

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

  const agreedTos = document.getElementById(`users:${userId}-agreedTos`);
  if (agreedTos) {
    const input = agreedTos.getElementsByTagName("input")![0];
    data.agreedTos = (input as HTMLInputElement).checked;
  }

  const edit = document.getElementById(`users:${userId}-control`);
  if (edit) {
    (edit as any).saveButton.disabled = true;
  }

  try {
    const body = {
      data: <Partial<Api.User>>{
        type: "users",
        attributes: data
      }
    };
    let url = `http://localhost:3000/api/users`;

    // If we're saving an existing user....
    if (userId != "-1") {
      url += `/${userId}`;
      body.data.id = userId;
    }

    const doc = await fetchWithToken<JsonApiResponseDocWithoutErrors>(url, {
      method: userId == "-1" ? "POST" : "PATCH",
      headers: {
        "Content-Type": "application/vnd.api+json"
      },
      body: JSON.stringify(body)
    });

    if (edit && userId != "-1") {
      edit.appendChild((edit as any).editButton);
      edit.appendChild((edit as any).deleteButton);
      edit.removeChild((edit as any).saveButton);
      (edit as any).deleteButton.disabled = false;
    }

    if (userId == "-1") {
      const container = document.getElementById("users-list")!;
      const row = buildUserRow(doc!.data as Api.User);
      for (let i = 0; i < row.length; i++) {
        const oldChild = container.querySelector(`.cell${i+1}[data-userId='${userId}']`);
        if (oldChild) {
          container.replaceChild(row[i], oldChild);
        } else {
          console.error("Couldn't locate old child "+`.cell${i+1}[data-userId='${userId}']`);
        }
      }
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

const addUserRow = async function() {
  const container = document.getElementById("users-list");
  if (!container) {
    alert("users-list not found!");
  } else {
    const row = buildUserRow({
      type: "users",
      id: -1,
      attributes: {
        name: "",
        email: "",
        agreedTos: false,
      }
    });
    for (let j = 0; j < row.length; j++) {
      container.appendChild(row[j]);
    }
    editUserRow("-1");
  }
}

const getObjectHistory = async function(type: string, id: number|string): Promise<Array<EventsApi.DataEvent>> {
  // Don't need to use token here, but this does some convenient things for us
  const doc = await fetchWithToken<JsonApiResponseDocWithoutErrors>(
    `http://localhost:3001/api/${type}/${id}/data-events`
  );

  if (!doc) {
    throw new Error(`Couldn't get data events for ${type}:${id}`);
  }

  return <Array<EventsApi.DataEvent>>doc.data;
}

const showObjectHistory = function(userId: string|number, events: Array<EventsApi.DataEvent>) {
  const container = document.getElementById(`users:${userId}-log`);
  if (!container) {
    throw new Error(`Couldn't find history container for user ${userId}`);
  }

  container.innerHTML = "";

  const ul = document.createElement("ul");
  for(let i = 0; i < events.length; i++) {
    // Don't show instances of a user viewing himself
    if (
      events[i].attributes.action === "viewed" &&
      events[i].attributes.actorId === events[i].attributes.targetId &&
      events[i].attributes.targetType === "users"
    ) {
      continue;
    }

    const li = document.createElement("li");
    li.innerHTML = formatDataEvent(events[i]);
    ul.appendChild(li);
  }

  container.appendChild(ul);
}

const formatDataEvent = function(event: EventsApi.DataEvent): string {
  const e = event.attributes;
  const t = new Date(e.timestamp);
  if (e.action === "changed") {
    return `${t.toLocaleString()}: <strong>User ${e.actorId} ${e.action}</strong> field ` +
    `${e.fieldName} from '${e.prevData}' to '${e.newData}'`;
  } else {
    return `${t.toLocaleString()}: <strong>User ${e.actorId} ${e.action}</strong> this user`;
  }
}







let token: string = "";
window.addEventListener("DOMContentLoaded", async function(ev) {
  token = await refreshToken(1);
  const users = getUsers(token);
  buildUsersTable(await users, document.getElementById("users-list")!);

  const addUserButton = document.getElementById("add-user");
  if (addUserButton) {
    addUserButton.addEventListener("click", addUserRow);
  } else {
    alert("No button with id 'add-user'!");
  }
});

