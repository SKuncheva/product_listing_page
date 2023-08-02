(function (global, factory) {
  typeof exports === "object" && typeof module !== "undefined"
    ? (module.exports = factory(
        require("http"),
        require("fs"),
        require("crypto")
      ))
    : typeof define === "function" && define.amd
    ? define(["http", "fs", "crypto"], factory)
    : ((global =
        typeof globalThis !== "undefined" ? globalThis : global || self),
      (global.Server = factory(global.http, global.fs, global.crypto)));
})(this, function (http, fs, crypto) {
  "use strict";

  function _interopDefaultLegacy(e) {
    return e && typeof e === "object" && "default" in e ? e : { default: e };
  }

  var http__default = /*#__PURE__*/ _interopDefaultLegacy(http);
  var fs__default = /*#__PURE__*/ _interopDefaultLegacy(fs);
  var crypto__default = /*#__PURE__*/ _interopDefaultLegacy(crypto);

  class ServiceError extends Error {
    constructor(message = "Service Error") {
      super(message);
      this.name = "ServiceError";
    }
  }

  class NotFoundError extends ServiceError {
    constructor(message = "Resource not found") {
      super(message);
      this.name = "NotFoundError";
      this.status = 404;
    }
  }

  class RequestError extends ServiceError {
    constructor(message = "Request error") {
      super(message);
      this.name = "RequestError";
      this.status = 400;
    }
  }

  class ConflictError extends ServiceError {
    constructor(message = "Resource conflict") {
      super(message);
      this.name = "ConflictError";
      this.status = 409;
    }
  }

  class AuthorizationError extends ServiceError {
    constructor(message = "Unauthorized") {
      super(message);
      this.name = "AuthorizationError";
      this.status = 401;
    }
  }

  class CredentialError extends ServiceError {
    constructor(message = "Forbidden") {
      super(message);
      this.name = "CredentialError";
      this.status = 403;
    }
  }

  var errors = {
    ServiceError,
    NotFoundError,
    RequestError,
    ConflictError,
    AuthorizationError,
    CredentialError,
  };

  const { ServiceError: ServiceError$1 } = errors;

  function createHandler(plugins, services) {
    return async function handler(req, res) {
      const method = req.method;
      console.info(`<< ${req.method} ${req.url}`);

      // Redirect fix for admin panel relative paths
      if (req.url.slice(-6) == "/admin") {
        res.writeHead(302, {
          Location: `http://${req.headers.host}/admin/`,
        });
        return res.end();
      }

      let status = 200;
      let headers = {
        "Access-Control-Allow-Origin": "*",
        "Content-Type": "application/json",
      };
      let result = "";
      let context;

      // NOTE: the OPTIONS method results in undefined result and also it never processes plugins - keep this in mind
      if (method == "OPTIONS") {
        Object.assign(headers, {
          "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
          "Access-Control-Allow-Credentials": false,
          "Access-Control-Max-Age": "86400",
          "Access-Control-Allow-Headers":
            "X-Requested-With, X-HTTP-Method-Override, Content-Type, Accept, X-Authorization, X-Admin",
        });
      } else {
        try {
          context = processPlugins();
          await handle(context);
        } catch (err) {
          if (err instanceof ServiceError$1) {
            status = err.status || 400;
            result = composeErrorObject(err.code || status, err.message);
          } else {
            // Unhandled exception, this is due to an error in the service code - REST consumers should never have to encounter this;
            // If it happens, it must be debugged in a future version of the server
            console.error(err);
            status = 500;
            result = composeErrorObject(500, "Server Error");
          }
        }
      }

      res.writeHead(status, headers);
      if (
        context != undefined &&
        context.util != undefined &&
        context.util.throttle
      ) {
        await new Promise((r) => setTimeout(r, 500 + Math.random() * 500));
      }
      res.end(result);

      function processPlugins() {
        const context = { params: {} };
        plugins.forEach((decorate) => decorate(context, req));
        return context;
      }

      async function handle(context) {
        const { serviceName, tokens, query, body } = await parseRequest(req);
        if (serviceName == "admin") {
          return ({ headers, result } = services["admin"](
            method,
            tokens,
            query,
            body
          ));
        } else if (serviceName == "favicon.ico") {
          return ({ headers, result } = services["favicon"](
            method,
            tokens,
            query,
            body
          ));
        }

        const service = services[serviceName];

        if (service === undefined) {
          status = 400;
          result = composeErrorObject(
            400,
            `Service "${serviceName}" is not supported`
          );
          console.error("Missing service " + serviceName);
        } else {
          result = await service(context, { method, tokens, query, body });
        }

        // NOTE: logout does not return a result
        // in this case the content type header should be omitted, to allow checks on the client
        if (result !== undefined) {
          result = JSON.stringify(result);
        } else {
          status = 204;
          delete headers["Content-Type"];
        }
      }
    };
  }

  function composeErrorObject(code, message) {
    return JSON.stringify({
      code,
      message,
    });
  }

  async function parseRequest(req) {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const tokens = url.pathname.split("/").filter((x) => x.length > 0);
    const serviceName = tokens.shift();
    const queryString = url.search.split("?")[1] || "";
    const query = queryString
      .split("&")
      .filter((s) => s != "")
      .map((x) => x.split("="))
      .reduce(
        (p, [k, v]) => Object.assign(p, { [k]: decodeURIComponent(v) }),
        {}
      );
    const body = await parseBody(req);

    return {
      serviceName,
      tokens,
      query,
      body,
    };
  }

  function parseBody(req) {
    return new Promise((resolve, reject) => {
      let body = "";
      req.on("data", (chunk) => (body += chunk.toString()));
      req.on("end", () => {
        try {
          resolve(JSON.parse(body));
        } catch (err) {
          resolve(body);
        }
      });
    });
  }

  var requestHandler = createHandler;

  class Service {
    constructor() {
      this._actions = [];
      this.parseRequest = this.parseRequest.bind(this);
    }

    /**
     * Handle service request, after it has been processed by a request handler
     * @param {*} context Execution context, contains result of middleware processing
     * @param {{method: string, tokens: string[], query: *, body: *}} request Request parameters
     */
    async parseRequest(context, request) {
      for (let { method, name, handler } of this._actions) {
        if (
          method === request.method &&
          matchAndAssignParams(context, request.tokens[0], name)
        ) {
          return await handler(
            context,
            request.tokens.slice(1),
            request.query,
            request.body
          );
        }
      }
    }

    /**
     * Register service action
     * @param {string} method HTTP method
     * @param {string} name Action name. Can be a glob pattern.
     * @param {(context, tokens: string[], query: *, body: *)} handler Request handler
     */
    registerAction(method, name, handler) {
      this._actions.push({ method, name, handler });
    }

    /**
     * Register GET action
     * @param {string} name Action name. Can be a glob pattern.
     * @param {(context, tokens: string[], query: *, body: *)} handler Request handler
     */
    get(name, handler) {
      this.registerAction("GET", name, handler);
    }

    /**
     * Register POST action
     * @param {string} name Action name. Can be a glob pattern.
     * @param {(context, tokens: string[], query: *, body: *)} handler Request handler
     */
    post(name, handler) {
      this.registerAction("POST", name, handler);
    }

    /**
     * Register PUT action
     * @param {string} name Action name. Can be a glob pattern.
     * @param {(context, tokens: string[], query: *, body: *)} handler Request handler
     */
    put(name, handler) {
      this.registerAction("PUT", name, handler);
    }

    /**
     * Register PATCH action
     * @param {string} name Action name. Can be a glob pattern.
     * @param {(context, tokens: string[], query: *, body: *)} handler Request handler
     */
    patch(name, handler) {
      this.registerAction("PATCH", name, handler);
    }

    /**
     * Register DELETE action
     * @param {string} name Action name. Can be a glob pattern.
     * @param {(context, tokens: string[], query: *, body: *)} handler Request handler
     */
    delete(name, handler) {
      this.registerAction("DELETE", name, handler);
    }
  }

  function matchAndAssignParams(context, name, pattern) {
    if (pattern == "*") {
      return true;
    } else if (pattern[0] == ":") {
      context.params[pattern.slice(1)] = name;
      return true;
    } else if (name == pattern) {
      return true;
    } else {
      return false;
    }
  }

  var Service_1 = Service;

  function uuid() {
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(
      /[xy]/g,
      function (c) {
        let r = (Math.random() * 16) | 0,
          v = c == "x" ? r : (r & 0x3) | 0x8;
        return v.toString(16);
      }
    );
  }

  var util = {
    uuid,
  };

  const uuid$1 = util.uuid;

  const data = fs__default["default"].existsSync("./data")
    ? fs__default["default"].readdirSync("./data").reduce((p, c) => {
        const content = JSON.parse(
          fs__default["default"].readFileSync("./data/" + c)
        );
        const collection = c.slice(0, -5);
        p[collection] = {};
        for (let endpoint in content) {
          p[collection][endpoint] = content[endpoint];
        }
        return p;
      }, {})
    : {};

  const actions = {
    get: (context, tokens, query, body) => {
      tokens = [context.params.collection, ...tokens];
      let responseData = data;
      for (let token of tokens) {
        if (responseData !== undefined) {
          responseData = responseData[token];
        }
      }
      return responseData;
    },
    post: (context, tokens, query, body) => {
      tokens = [context.params.collection, ...tokens];
      console.log("Request body:\n", body);

      // TODO handle collisions, replacement
      let responseData = data;
      for (let token of tokens) {
        if (responseData.hasOwnProperty(token) == false) {
          responseData[token] = {};
        }
        responseData = responseData[token];
      }

      const newId = uuid$1();
      responseData[newId] = Object.assign({}, body, { _id: newId });
      return responseData[newId];
    },
    put: (context, tokens, query, body) => {
      tokens = [context.params.collection, ...tokens];
      console.log("Request body:\n", body);

      let responseData = data;
      for (let token of tokens.slice(0, -1)) {
        if (responseData !== undefined) {
          responseData = responseData[token];
        }
      }
      if (
        responseData !== undefined &&
        responseData[tokens.slice(-1)] !== undefined
      ) {
        responseData[tokens.slice(-1)] = body;
      }
      return responseData[tokens.slice(-1)];
    },
    patch: (context, tokens, query, body) => {
      tokens = [context.params.collection, ...tokens];
      console.log("Request body:\n", body);

      let responseData = data;
      for (let token of tokens) {
        if (responseData !== undefined) {
          responseData = responseData[token];
        }
      }
      if (responseData !== undefined) {
        Object.assign(responseData, body);
      }
      return responseData;
    },
    delete: (context, tokens, query, body) => {
      tokens = [context.params.collection, ...tokens];
      let responseData = data;

      for (let i = 0; i < tokens.length; i++) {
        const token = tokens[i];
        if (responseData.hasOwnProperty(token) == false) {
          return null;
        }
        if (i == tokens.length - 1) {
          const body = responseData[token];
          delete responseData[token];
          return body;
        } else {
          responseData = responseData[token];
        }
      }
    },
  };

  const dataService = new Service_1();
  dataService.get(":collection", actions.get);
  dataService.post(":collection", actions.post);
  dataService.put(":collection", actions.put);
  dataService.patch(":collection", actions.patch);
  dataService.delete(":collection", actions.delete);

  var jsonstore = dataService.parseRequest;

  /*
   * This service requires storage and auth plugins
   */

  const { AuthorizationError: AuthorizationError$1 } = errors;

  const userService = new Service_1();

  userService.get("me", getSelf);
  userService.post("register", onRegister);
  userService.post("login", onLogin);
  userService.get("logout", onLogout);

  function getSelf(context, tokens, query, body) {
    if (context.user) {
      const result = Object.assign({}, context.user);
      delete result.hashedPassword;
      return result;
    } else {
      throw new AuthorizationError$1();
    }
  }

  function onRegister(context, tokens, query, body) {
    return context.auth.register(body);
  }

  function onLogin(context, tokens, query, body) {
    return context.auth.login(body);
  }

  function onLogout(context, tokens, query, body) {
    return context.auth.logout();
  }

  var users = userService.parseRequest;

  const { NotFoundError: NotFoundError$1, RequestError: RequestError$1 } =
    errors;

  var crud = {
    get,
    post,
    put,
    patch,
    delete: del,
  };

  function validateRequest(context, tokens, query) {
    /*
        if (context.params.collection == undefined) {
            throw new RequestError('Please, specify collection name');
        }
        */
    if (tokens.length > 1) {
      throw new RequestError$1();
    }
  }

  function parseWhere(query) {
    const operators = {
      "<=": (prop, value) => (record) => record[prop] <= JSON.parse(value),
      "<": (prop, value) => (record) => record[prop] < JSON.parse(value),
      ">=": (prop, value) => (record) => record[prop] >= JSON.parse(value),
      ">": (prop, value) => (record) => record[prop] > JSON.parse(value),
      "=": (prop, value) => (record) => record[prop] == JSON.parse(value),
      " like ": (prop, value) => (record) =>
        record[prop].toLowerCase().includes(JSON.parse(value).toLowerCase()),
      " in ": (prop, value) => (record) =>
        JSON.parse(`[${/\((.+?)\)/.exec(value)[1]}]`).includes(record[prop]),
    };
    const pattern = new RegExp(
      `^(.+?)(${Object.keys(operators).join("|")})(.+?)$`,
      "i"
    );

    try {
      let clauses = [query.trim()];
      let check = (a, b) => b;
      let acc = true;
      if (query.match(/ and /gi)) {
        // inclusive
        clauses = query.split(/ and /gi);
        check = (a, b) => a && b;
        acc = true;
      } else if (query.match(/ or /gi)) {
        // optional
        clauses = query.split(/ or /gi);
        check = (a, b) => a || b;
        acc = false;
      }
      clauses = clauses.map(createChecker);

      return (record) => clauses.map((c) => c(record)).reduce(check, acc);
    } catch (err) {
      throw new Error("Could not parse WHERE clause, check your syntax.");
    }

    function createChecker(clause) {
      let [match, prop, operator, value] = pattern.exec(clause);
      [prop, value] = [prop.trim(), value.trim()];

      return operators[operator.toLowerCase()](prop, value);
    }
  }

  function get(context, tokens, query, body) {
    validateRequest(context, tokens);

    let responseData;

    try {
      if (query.where) {
        responseData = context.storage
          .get(context.params.collection)
          .filter(parseWhere(query.where));
      } else if (context.params.collection) {
        responseData = context.storage.get(
          context.params.collection,
          tokens[0]
        );
      } else {
        // Get list of collections
        return context.storage.get();
      }

      if (query.sortBy) {
        const props = query.sortBy
          .split(",")
          .filter((p) => p != "")
          .map((p) => p.split(" ").filter((p) => p != ""))
          .map(([p, desc]) => ({ prop: p, desc: desc ? true : false }));

        // Sorting priority is from first to last, therefore we sort from last to first
        for (let i = props.length - 1; i >= 0; i--) {
          let { prop, desc } = props[i];
          responseData.sort(({ [prop]: propA }, { [prop]: propB }) => {
            if (typeof propA == "number" && typeof propB == "number") {
              return (propA - propB) * (desc ? -1 : 1);
            } else {
              return propA.localeCompare(propB) * (desc ? -1 : 1);
            }
          });
        }
      }

      if (query.offset) {
        responseData = responseData.slice(Number(query.offset) || 0);
      }
      const pageSize = Number(query.pageSize) || 10;
      if (query.pageSize) {
        responseData = responseData.slice(0, pageSize);
      }

      if (query.distinct) {
        const props = query.distinct.split(",").filter((p) => p != "");
        responseData = Object.values(
          responseData.reduce((distinct, c) => {
            const key = props.map((p) => c[p]).join("::");
            if (distinct.hasOwnProperty(key) == false) {
              distinct[key] = c;
            }
            return distinct;
          }, {})
        );
      }

      if (query.count) {
        return responseData.length;
      }

      if (query.select) {
        const props = query.select.split(",").filter((p) => p != "");
        responseData = Array.isArray(responseData)
          ? responseData.map(transform)
          : transform(responseData);

        function transform(r) {
          const result = {};
          props.forEach((p) => (result[p] = r[p]));
          return result;
        }
      }

      if (query.load) {
        const props = query.load.split(",").filter((p) => p != "");
        props.map((prop) => {
          const [propName, relationTokens] = prop.split("=");
          const [idSource, collection] = relationTokens.split(":");
          console.log(
            `Loading related records from "${collection}" into "${propName}", joined on "_id"="${idSource}"`
          );
          const storageSource =
            collection == "users" ? context.protectedStorage : context.storage;
          responseData = Array.isArray(responseData)
            ? responseData.map(transform)
            : transform(responseData);

          function transform(r) {
            const seekId = r[idSource];
            const related = storageSource.get(collection, seekId);
            delete related.hashedPassword;
            r[propName] = related;
            return r;
          }
        });
      }
    } catch (err) {
      console.error(err);
      if (err.message.includes("does not exist")) {
        throw new NotFoundError$1();
      } else {
        throw new RequestError$1(err.message);
      }
    }

    context.canAccess(responseData);

    return responseData;
  }

  function post(context, tokens, query, body) {
    console.log("Request body:\n", body);

    validateRequest(context, tokens);
    if (tokens.length > 0) {
      throw new RequestError$1("Use PUT to update records");
    }
    context.canAccess(undefined, body);

    body._ownerId = context.user._id;
    let responseData;

    try {
      responseData = context.storage.add(context.params.collection, body);
    } catch (err) {
      throw new RequestError$1();
    }

    return responseData;
  }

  function put(context, tokens, query, body) {
    console.log("Request body:\n", body);

    validateRequest(context, tokens);
    if (tokens.length != 1) {
      throw new RequestError$1("Missing entry ID");
    }

    let responseData;
    let existing;

    try {
      existing = context.storage.get(context.params.collection, tokens[0]);
    } catch (err) {
      throw new NotFoundError$1();
    }

    context.canAccess(existing, body);

    try {
      responseData = context.storage.set(
        context.params.collection,
        tokens[0],
        body
      );
    } catch (err) {
      throw new RequestError$1();
    }

    return responseData;
  }

  function patch(context, tokens, query, body) {
    console.log("Request body:\n", body);

    validateRequest(context, tokens);
    if (tokens.length != 1) {
      throw new RequestError$1("Missing entry ID");
    }

    let responseData;
    let existing;

    try {
      existing = context.storage.get(context.params.collection, tokens[0]);
    } catch (err) {
      throw new NotFoundError$1();
    }

    context.canAccess(existing, body);

    try {
      responseData = context.storage.merge(
        context.params.collection,
        tokens[0],
        body
      );
    } catch (err) {
      throw new RequestError$1();
    }

    return responseData;
  }

  function del(context, tokens, query, body) {
    validateRequest(context, tokens);
    if (tokens.length != 1) {
      throw new RequestError$1("Missing entry ID");
    }

    let responseData;
    let existing;

    try {
      existing = context.storage.get(context.params.collection, tokens[0]);
    } catch (err) {
      throw new NotFoundError$1();
    }

    context.canAccess(existing);

    try {
      responseData = context.storage.delete(
        context.params.collection,
        tokens[0]
      );
    } catch (err) {
      throw new RequestError$1();
    }

    return responseData;
  }

  /*
   * This service requires storage and auth plugins
   */

  const dataService$1 = new Service_1();
  dataService$1.get(":collection", crud.get);
  dataService$1.post(":collection", crud.post);
  dataService$1.put(":collection", crud.put);
  dataService$1.patch(":collection", crud.patch);
  dataService$1.delete(":collection", crud.delete);

  var data$1 = dataService$1.parseRequest;

  const imgdata =
    "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Td4DLneAwSddMiRH8tMU8nng/Yy+KQsM3AKBNbe35j5OH4A0dbV8AxwcAqMFyl73eHd3e2//nmn29wOGi3Kv+RixSgAAEkxpVFh0WE1MOmNvbS5hZG9iZS54bXAAAAAAADw/eHBhY2tldCBiZWdpbj0i77u/IiBpZD0iVzVNME1wQ2VoaUh6cmVTek5UY3prYzlkIj8+Cjx4OnhtcG1ldGEgeG1sbnM6eD0iYWRvYmU6bnM6bWV0YS8iIHg6eG1wdGs9IlhNUCBDb3JlIDQuNC4wLUV4aXYyIj4KIDxyZGY6UkRGIHhtbG5zOnJkZj0iaHR0cDovL3d3dy53My5vcmcvMTk5OS8wMi8yMi1yZGYtc3ludGF4LW5zIyI+CiAgPHJkZjpEZXNjcmlwdGlvbiByZGY6YWJvdXQ9IiIKICAgIHhtbG5zOmlwdGNFeHQ9Imh0dHA6Ly9pcHRjLm9yZy9zdGQvSXB0YzR4bXBFeHQvMjAwOC0wMi0yOS8iCiAgICB4bWxuczp4bXBNTT0iaHR0cDovL25zLmFkb2JlLmNvbS94YXAvMS4wL21tLyIKICAgIHhtbG5zOnN0RXZ0PSJodHRwOi8vbnMuYWRvYmUuY29tL3hhcC8xLjAvc1R5cGUvUmVzb3VyY2VFdmVudCMiCiAgICB4bWxuczpwbHVzPSJodHRwOi8vbnMudXNlcGx1cy5vcmcvbGRmL3htcC8xLjAvIgogICAgeG1sbnM6R0lNUD0iaHR0cDovL3d3dy5naW1wLm9yZy94bXAvIgogICAgeG1sbnM6ZGM9Imh0dHA6Ly9wdXJsLm9yZy9kYy9lbGVtZW50cy8xLjEvIgogICAgeG1sbnM6cGhvdG9zaG9wPSJodHRwOi8vbnMuYWRvYmUuY29tL3Bob3Rvc2hvcC8xLjAvIgogICAgeG1sbnM6eG1wPSJodHRwOi8vbnMuYWRvYmUuY29tL3hhcC8xLjAvIgogICAgeG1sbnM6eG1wUmlnaHRzPSJodHRwOi8vbnMuYWRvYmUuY29tL3hhcC8xLjAvcmlnaHRzLyIKICAgeG1wTU06RG9jdW1lbnRJRD0iZ2ltcDpkb2NpZDpnaW1wOjdjZDM3NWM3LTcwNmItNDlkMy1hOWRkLWNmM2Q3MmMwY2I4ZCIKICAgeG1wTU06SW5zdGFuY2VJRD0ieG1wLmlpZDo2NGY2YTJlYy04ZjA5LTRkZTMtOTY3ZC05MTUyY2U5NjYxNTAiCiAgIHhtcE1NOk9yaWdpbmFsRG9jdW1lbnRJRD0ieG1wLmRpZDoxMmE1NzI5Mi1kNmJkLTRlYjQtOGUxNi1hODEzYjMwZjU0NWYiCiAgIEdJTVA6QVBJPSIyLjAiCiAgIEdJTVA6UGxhdGZvcm09IldpbmRvd3MiCiAgIEdJTVA6VGltZVN0YW1wPSIxNjEzMzAwNzI5NTMwNjQzIgogICBHSU1QOlZlcnNpb249IjIuMTAuMTIiCiAgIGRjOkZvcm1hdD0iaW1hZ2UvcG5nIgogICBwaG90b3Nob3A6Q3JlZGl0PSJHZXR0eSBJbWFnZXMvaVN0b2NrcGhvdG8iCiAgIHhtcDpDcmVhdG9yVG9vbD0iR0lNUCAyLjEwIgogICB4bXBSaWdodHM6V2ViU3RhdGVtZW50PSJodHRwczovL3d3dy5pc3RvY2twaG90by5jb20vbGVnYWwvbGljZW5zZS1hZ3JlZW1lbnQ/dXRtX21lZGl1bT1vcmdhbmljJmFtcDt1dG1fc291cmNlPWdvb2dsZSZhbXA7dXRtX2NhbXBhaWduPWlwdGN1cmwiPgogICA8aXB0Y0V4dDpMb2NhdGlvbkNyZWF0ZWQ+CiAgICA8cmRmOkJhZy8+CiAgIDwvaXB0Y0V4dDpMb2NhdGlvbkNyZWF0ZWQ+CiAgIDxpcHRjRXh0OkxvY2F0aW9uU2hvd24+CiAgICA8cmRmOkJhZy8+CiAgIDwvaXB0Y0V4dDpMb2NhdGlvblNob3duPgogICA8aXB0Y0V4dDpBcnR3b3JrT3JPYmplY3Q+CiAgICA8cmRmOkJhZy8+CiAgIDwvaXB0Y0V4dDpBcnR3b3JrT3JPYmplY3Q+CiAgIDxpcHRjRXh0OlJlZ2lzdHJ5SWQ+CiAgICA8cmRmOkJhZy8+CiAgIDwvaXB0Y0V4dDpSZWdpc3RyeUlkPgogICA8eG1wTU06SGlzdG9yeT4KICAgIDxyZGY6U2VxPgogICAgIDxyZGY6bGkKICAgICAgc3RFdnQ6YWN0aW9uPSJzYXZlZCIKICAgICAgc3RFdnQ6Y2hhbmdlZD0iLyIKICAgICAgc3RFdnQ6aW5zdGFuY2VJRD0ieG1wLmlpZDpjOTQ2M2MxMC05OWE4LTQ1NDQtYmRlOS1mNzY0ZjdhODJlZDkiCiAgICAgIHN0RXZ0OnNvZnR3YXJlQWdlbnQ9IkdpbXAgMi4xMCAoV2luZG93cykiCiAgICAgIHN0RXZ0OndoZW49IjIwMjEtMDItMTRUMTM6MDU6MjkiLz4KICAgIDwvcmRmOlNlcT4KICAgPC94bXBNTTpIaXN0b3J5PgogICA8cGx1czpJbWFnZVN1cHBsaWVyPgogICAgPHJkZjpTZXEvPgogICA8L3BsdXM6SW1hZ2VTdXBwbGllcj4KICAgPHBsdXM6SW1hZ2VDcmVhdG9yPgogICAgPHJkZjpTZXEvPgogICA8L3BsdXM6SW1hZ2VDcmVhdG9yPgogICA8cGx1czpDb3B5cmlnaHRPd25lcj4KICAgIDxyZGY6U2VxLz4KICAgPC9wbHVzOkNvcHlyaWdodE93bmVyPgogICA8cGx1czpMaWNlbnNvcj4KICAgIDxyZGY6U2VxPgogICAgIDxyZGY6bGkKICAgICAgcGx1czpMaWNlbnNvclVSTD0iaHR0cHM6Ly93d3cuaXN0b2NrcGhvdG8uY29tL3Bob3RvL2xpY2Vuc2UtZ20xMTUwMzQ1MzQxLT91dG1fbWVkaXVtPW9yZ2FuaWMmYW1wO3V0bV9zb3VyY2U9Z29vZ2xlJmFtcDt1dG1fY2FtcGFpZ249aXB0Y3VybCIvPgogICAgPC9yZGY6U2VxPgogICA8L3BsdXM6TGljZW5zb3I+CiAgIDxkYzpjcmVhdG9yPgogICAgPHJkZjpTZXE+CiAgICAgPHJkZjpsaT5WbGFkeXNsYXYgU2VyZWRhPC9yZGY6bGk+CiAgICA8L3JkZjpTZXE+CiAgIDwvZGM6Y3JlYXRvcj4KICAgPGRjOmRlc2NyaXB0aW9uPgogICAgPHJkZjpBbHQ+CiAgICAgPHJkZjpsaSB4bWw6bGFuZz0ieC1kZWZhdWx0Ij5TZXJ2aWNlIHRvb2xzIGljb24gb24gd2hpdGUgYmFja2dyb3VuZC4gVmVjdG9yIGlsbHVzdHJhdGlvbi48L3JkZjpsaT4KICAgIDwvcmRmOkFsdD4KICAgPC9kYzpkZXNjcmlwdGlvbj4KICA8L3JkZjpEZXNjcmlwdGlvbj4KIDwvcmRmOlJERj4KPC94OnhtcG1ldGE+CiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAKICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIAogICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgCiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAKICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIAogICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgCiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAKICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIAogICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgCiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAKICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIAogICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgCiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAKICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIAogICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgCiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAKICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIAogICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgCiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAKICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIAogICAgICAgICAgICAgICAgICAgICAgICAgICAKPD94cGFja2V0IGVuZD0idyI/PmWJCnkAAAAGYktHRAD/AP8A/6C9p5MAAAAJcEhZcwAALiMAAC4jAXilP3YAAAAHdElNRQflAg4LBR0CZnO/AAAARHRFWHRDb21tZW50AFNlcnZpY2UgdG9vbHMgaWNvbiBvbiB3aGl0ZSBiYWNrZ3JvdW5kLiBWZWN0b3IgaWxsdXN0cmF0aW9uLlwvEeIAAAMxSURBVHja7Z1bcuQwCEX7qrLQXlp2ynxNVWbK7dgWj3sl9JvYRhxACD369erW7UMzx/cYaychonAQvXM5ABYkpynoYIiEGdoQog6AYfywBrCxF4zNrX/7McBbuXJe8rXx/KBDULcGsMREzCbeZ4J6ME/9wVH5d95rogZp3npEgPLP3m2iUSGqXBJS5Dr6hmLm8kRuZABYti5TMaailV8LodNQwTTUWk4/WZk75l0kM0aZQdaZjMqkrQDAuyMVJWFjMB4GANXr0lbZBxQKr7IjI7QvVWkok/Jn5UHVh61CYPs+/i7eL9j3y/Au8WqoAIC34k8/9k7N8miLcaGWHwgjZXE/awyYX7h41wKMCskZM2HXAddDkTdglpSjz5bcKPbcCEKwT3+DhxtVpJvkEC7rZSgq32NMSBoXaCdiahDCKrND0fpX8oQlVsQ8IFQZ1VARdIF5wroekAjB07gsAgDUIbQHFENIDEX4CQANIVe8Iw/ASiACLXl28eaf579OPuBa9/mrELUYHQ1t3KHlZZnRcXb2/c7ygXIQZqjDMEzeSrOgCAhqYMvTUE+FKXoVxTxgk3DEPREjGzj3nAk/VaKyB9GVIu4oMyOlrQZgrBBEFG9PAZTfs3amYDGrP9Wl964IeFvtz9JFluIvlEvcdoXDOdxggbDxGwTXcxFRi/LdirKgZUBm7SUdJG69IwSUzAMWgOAq/4hyrZVaJISSNWHFVbEoCFEhyBrCtXS9L+so9oTy8wGqxbQDD350WTjNESVFEB5hdKzUGcV5QtYxVWR2Ssl4Mg9qI9u6FCBInJRXgfEEgtS9Cgrg7kKouq4mdcDNBnEHQvWFTdgdgsqP+MiluVeBM13ahx09AYSWi50gsF+I6vn7BmCEoHR3NBzkpIOw4+XdVBBGQUioblaZHbGlodtB+N/jxqwLX/x/NARfD8ADxTOCKIcwE4Lw0OIbguMYcGTlymEpHYLXIKx8zQEqIfS2lGJPaADFEBR/PMH79ErqtpnZmTBlvM4wgihPWDEEhXn1LISj50crNgfCp+dWHYQRCfb2zgfnBZmKGAyi914anK9Coi4LOMhoAn3uVtn+AGnLKxPUZnCuAAAAAElFTkSuQmCC";
  const img = Buffer.from(imgdata, "base64");

  var favicon = (method, tokens, query, body) => {
    console.log("serving favicon...");
    const headers = {
      "Content-Type": "image/png",
      "Content-Length": img.length,
    };
    let result = img;

    return {
      headers,
      result,
    };
  };

  var require$$0 =
    '<!DOCTYPE html>\r\n<html lang="en">\r\n<head>\r\n    <meta charset="UTF-8">\r\n    <meta http-equiv="X-UA-Compatible" content="IE=edge">\r\n    <meta name="viewport" content="width=device-width, initial-scale=1.0">\r\n    <title>SUPS Admin Panel</title>\r\n    <style>\r\n        * {\r\n            padding: 0;\r\n            margin: 0;\r\n        }\r\n\r\n        body {\r\n            padding: 32px;\r\n            font-size: 16px;\r\n        }\r\n\r\n        .layout::after {\r\n            content: \'\';\r\n            clear: both;\r\n            display: table;\r\n        }\r\n\r\n        .col {\r\n            display: block;\r\n            float: left;\r\n        }\r\n\r\n        p {\r\n            padding: 8px 16px;\r\n        }\r\n\r\n        table {\r\n            border-collapse: collapse;\r\n        }\r\n\r\n        caption {\r\n            font-size: 120%;\r\n            text-align: left;\r\n            padding: 4px 8px;\r\n            font-weight: bold;\r\n            background-color: #ddd;\r\n        }\r\n\r\n        table, tr, th, td {\r\n            border: 1px solid #ddd;\r\n        }\r\n\r\n        th, td {\r\n            padding: 4px 8px;\r\n        }\r\n\r\n        ul {\r\n            list-style: none;\r\n        }\r\n\r\n        .collection-list a {\r\n            display: block;\r\n            width: 120px;\r\n            padding: 4px 8px;\r\n            text-decoration: none;\r\n            color: black;\r\n            background-color: #ccc;\r\n        }\r\n        .collection-list a:hover {\r\n            background-color: #ddd;\r\n        }\r\n        .collection-list a:visited {\r\n            color: black;\r\n        }\r\n    </style>\r\n    <script type="module">\nimport { html, render } from \'https://unpkg.com/lit-html?module\';\nimport { until } from \'https://unpkg.com/lit-html/directives/until?module\';\n\nconst api = {\r\n    async get(url) {\r\n        return json(url);\r\n    },\r\n    async post(url, body) {\r\n        return json(url, {\r\n            method: \'POST\',\r\n            headers: { \'Content-Type\': \'application/json\' },\r\n            body: JSON.stringify(body)\r\n        });\r\n    }\r\n};\r\n\r\nasync function json(url, options) {\r\n    return await (await fetch(\'/\' + url, options)).json();\r\n}\r\n\r\nasync function getCollections() {\r\n    return api.get(\'data\');\r\n}\r\n\r\nasync function getRecords(collection) {\r\n    return api.get(\'data/\' + collection);\r\n}\r\n\r\nasync function getThrottling() {\r\n    return api.get(\'util/throttle\');\r\n}\r\n\r\nasync function setThrottling(throttle) {\r\n    return api.post(\'util\', { throttle });\r\n}\n\nasync function collectionList(onSelect) {\r\n    const collections = await getCollections();\r\n\r\n    return html`\r\n    <ul class="collection-list">\r\n        ${collections.map(collectionLi)}\r\n    </ul>`;\r\n\r\n    function collectionLi(name) {\r\n        return html`<li><a href="javascript:void(0)" @click=${(ev) => onSelect(ev, name)}>${name}</a></li>`;\r\n    }\r\n}\n\nasync function recordTable(collectionName) {\r\n    const records = await getRecords(collectionName);\r\n    const layout = getLayout(records);\r\n\r\n    return html`\r\n    <table>\r\n        <caption>${collectionName}</caption>\r\n        <thead>\r\n            <tr>${layout.map(f => html`<th>${f}</th>`)}</tr>\r\n        </thead>\r\n        <tbody>\r\n            ${records.map(r => recordRow(r, layout))}\r\n        </tbody>\r\n    </table>`;\r\n}\r\n\r\nfunction getLayout(records) {\r\n    const result = new Set([\'_id\']);\r\n    records.forEach(r => Object.keys(r).forEach(k => result.add(k)));\r\n\r\n    return [...result.keys()];\r\n}\r\n\r\nfunction recordRow(record, layout) {\r\n    return html`\r\n    <tr>\r\n        ${layout.map(f => html`<td>${JSON.stringify(record[f]) || html`<span>(missing)</span>`}</td>`)}\r\n    </tr>`;\r\n}\n\nasync function throttlePanel(display) {\r\n    const active = await getThrottling();\r\n\r\n    return html`\r\n    <p>\r\n        Request throttling: </span>${active}</span>\r\n        <button @click=${(ev) => set(ev, true)}>Enable</button>\r\n        <button @click=${(ev) => set(ev, false)}>Disable</button>\r\n    </p>`;\r\n\r\n    async function set(ev, state) {\r\n        ev.target.disabled = true;\r\n        await setThrottling(state);\r\n        display();\r\n    }\r\n}\n\n//import page from \'//unpkg.com/page/page.mjs\';\r\n\r\n\r\nfunction start() {\r\n    const main = document.querySelector(\'main\');\r\n    editor(main);\r\n}\r\n\r\nasync function editor(main) {\r\n    let list = html`<div class="col">Loading&hellip;</div>`;\r\n    let viewer = html`<div class="col">\r\n    <p>Select collection to view records</p>\r\n</div>`;\r\n    display();\r\n\r\n    list = html`<div class="col">${await collectionList(onSelect)}</div>`;\r\n    display();\r\n\r\n    async function display() {\r\n        render(html`\r\n        <section class="layout">\r\n            ${until(throttlePanel(display), html`<p>Loading</p>`)}\r\n        </section>\r\n        <section class="layout">\r\n            ${list}\r\n            ${viewer}\r\n        </section>`, main);\r\n    }\r\n\r\n    async function onSelect(ev, name) {\r\n        ev.preventDefault();\r\n        viewer = html`<div class="col">${await recordTable(name)}</div>`;\r\n        display();\r\n    }\r\n}\r\n\r\nstart();\n\n</script>\r\n</head>\r\n<body>\r\n    <main>\r\n        Loading&hellip;\r\n    </main>\r\n</body>\r\n</html>';

  const mode = process.argv[2] == "-dev" ? "dev" : "prod";

  const files = {
    index:
      mode == "prod"
        ? require$$0
        : fs__default["default"].readFileSync("./client/index.html", "utf-8"),
  };

  var admin = (method, tokens, query, body) => {
    const headers = {
      "Content-Type": "text/html",
    };
    let result = "";

    const resource = tokens.join("/");
    if (resource && resource.split(".").pop() == "js") {
      headers["Content-Type"] = "application/javascript";

      files[resource] =
        files[resource] ||
        fs__default["default"].readFileSync("./client/" + resource, "utf-8");
      result = files[resource];
    } else {
      result = files.index;
    }

    return {
      headers,
      result,
    };
  };

  /*
   * This service requires util plugin
   */

  const utilService = new Service_1();

  utilService.post("*", onRequest);
  utilService.get(":service", getStatus);

  function getStatus(context, tokens, query, body) {
    return context.util[context.params.service];
  }

  function onRequest(context, tokens, query, body) {
    Object.entries(body).forEach(([k, v]) => {
      console.log(`${k} ${v ? "enabled" : "disabled"}`);
      context.util[k] = v;
    });
    return "";
  }

  var util$1 = utilService.parseRequest;

  var services = {
    jsonstore,
    users,
    data: data$1,
    favicon,
    admin,
    util: util$1,
  };

  const { uuid: uuid$2 } = util;

  function initPlugin(settings) {
    const storage = createInstance(settings.seedData);
    const protectedStorage = createInstance(settings.protectedData);

    return function decoreateContext(context, request) {
      context.storage = storage;
      context.protectedStorage = protectedStorage;
    };
  }

  /**
   * Create storage instance and populate with seed data
   * @param {Object=} seedData Associative array with data. Each property is an object with properties in format {key: value}
   */
  function createInstance(seedData = {}) {
    const collections = new Map();

    // Initialize seed data from file
    for (let collectionName in seedData) {
      if (seedData.hasOwnProperty(collectionName)) {
        const collection = new Map();
        for (let recordId in seedData[collectionName]) {
          if (seedData.hasOwnProperty(collectionName)) {
            collection.set(recordId, seedData[collectionName][recordId]);
          }
        }
        collections.set(collectionName, collection);
      }
    }

    // Manipulation

    /**
     * Get entry by ID or list of all entries from collection or list of all collections
     * @param {string=} collection Name of collection to access. Throws error if not found. If omitted, returns list of all collections.
     * @param {number|string=} id ID of requested entry. Throws error if not found. If omitted, returns of list all entries in collection.
     * @return {Object} Matching entry.
     */
    function get(collection, id) {
      if (!collection) {
        return [...collections.keys()];
      }
      if (!collections.has(collection)) {
        throw new ReferenceError("Collection does not exist: " + collection);
      }
      const targetCollection = collections.get(collection);
      if (!id) {
        const entries = [...targetCollection.entries()];
        let result = entries.map(([k, v]) => {
          return Object.assign(deepCopy(v), { _id: k });
        });
        return result;
      }
      if (!targetCollection.has(id)) {
        throw new ReferenceError("Entry does not exist: " + id);
      }
      const entry = targetCollection.get(id);
      return Object.assign(deepCopy(entry), { _id: id });
    }

    /**
     * Add new entry to collection. ID will be auto-generated
     * @param {string} collection Name of collection to access. If the collection does not exist, it will be created.
     * @param {Object} data Value to store.
     * @return {Object} Original value with resulting ID under _id property.
     */
    function add(collection, data) {
      const record = assignClean({ _ownerId: data._ownerId }, data);

      let targetCollection = collections.get(collection);
      if (!targetCollection) {
        targetCollection = new Map();
        collections.set(collection, targetCollection);
      }
      let id = uuid$2();
      // Make sure new ID does not match existing value
      while (targetCollection.has(id)) {
        id = uuid$2();
      }

      record._createdOn = Date.now();
      targetCollection.set(id, record);
      return Object.assign(deepCopy(record), { _id: id });
    }

    /**
     * Replace entry by ID
     * @param {string} collection Name of collection to access. Throws error if not found.
     * @param {number|string} id ID of entry to update. Throws error if not found.
     * @param {Object} data Value to store. Record will be replaced!
     * @return {Object} Updated entry.
     */
    function set(collection, id, data) {
      if (!collections.has(collection)) {
        throw new ReferenceError("Collection does not exist: " + collection);
      }
      const targetCollection = collections.get(collection);
      if (!targetCollection.has(id)) {
        throw new ReferenceError("Entry does not exist: " + id);
      }

      const existing = targetCollection.get(id);
      const record = assignSystemProps(deepCopy(data), existing);
      record._updatedOn = Date.now();
      targetCollection.set(id, record);
      return Object.assign(deepCopy(record), { _id: id });
    }

    /**
     * Modify entry by ID
     * @param {string} collection Name of collection to access. Throws error if not found.
     * @param {number|string} id ID of entry to update. Throws error if not found.
     * @param {Object} data Value to store. Shallow merge will be performed!
     * @return {Object} Updated entry.
     */
    function merge(collection, id, data) {
      if (!collections.has(collection)) {
        throw new ReferenceError("Collection does not exist: " + collection);
      }
      const targetCollection = collections.get(collection);
      if (!targetCollection.has(id)) {
        throw new ReferenceError("Entry does not exist: " + id);
      }

      const existing = deepCopy(targetCollection.get(id));
      const record = assignClean(existing, data);
      record._updatedOn = Date.now();
      targetCollection.set(id, record);
      return Object.assign(deepCopy(record), { _id: id });
    }

    /**
     * Delete entry by ID
     * @param {string} collection Name of collection to access. Throws error if not found.
     * @param {number|string} id ID of entry to update. Throws error if not found.
     * @return {{_deletedOn: number}} Server time of deletion.
     */
    function del(collection, id) {
      if (!collections.has(collection)) {
        throw new ReferenceError("Collection does not exist: " + collection);
      }
      const targetCollection = collections.get(collection);
      if (!targetCollection.has(id)) {
        throw new ReferenceError("Entry does not exist: " + id);
      }
      targetCollection.delete(id);

      return { _deletedOn: Date.now() };
    }

    /**
     * Search in collection by query object
     * @param {string} collection Name of collection to access. Throws error if not found.
     * @param {Object} query Query object. Format {prop: value}.
     * @return {Object[]} Array of matching entries.
     */
    function query(collection, query) {
      if (!collections.has(collection)) {
        throw new ReferenceError("Collection does not exist: " + collection);
      }
      const targetCollection = collections.get(collection);
      const result = [];
      // Iterate entries of target collection and compare each property with the given query
      for (let [key, entry] of [...targetCollection.entries()]) {
        let match = true;
        for (let prop in entry) {
          if (query.hasOwnProperty(prop)) {
            const targetValue = query[prop];
            // Perform lowercase search, if value is string
            if (
              typeof targetValue === "string" &&
              typeof entry[prop] === "string"
            ) {
              if (
                targetValue.toLocaleLowerCase() !==
                entry[prop].toLocaleLowerCase()
              ) {
                match = false;
                break;
              }
            } else if (targetValue != entry[prop]) {
              match = false;
              break;
            }
          }
        }

        if (match) {
          result.push(Object.assign(deepCopy(entry), { _id: key }));
        }
      }

      return result;
    }

    return { get, add, set, merge, delete: del, query };
  }

  function assignSystemProps(target, entry, ...rest) {
    const whitelist = ["_id", "_createdOn", "_updatedOn", "_ownerId"];
    for (let prop of whitelist) {
      if (entry.hasOwnProperty(prop)) {
        target[prop] = deepCopy(entry[prop]);
      }
    }
    if (rest.length > 0) {
      Object.assign(target, ...rest);
    }

    return target;
  }

  function assignClean(target, entry, ...rest) {
    const blacklist = ["_id", "_createdOn", "_updatedOn", "_ownerId"];
    for (let key in entry) {
      if (blacklist.includes(key) == false) {
        target[key] = deepCopy(entry[key]);
      }
    }
    if (rest.length > 0) {
      Object.assign(target, ...rest);
    }

    return target;
  }

  function deepCopy(value) {
    if (Array.isArray(value)) {
      return value.map(deepCopy);
    } else if (typeof value == "object") {
      return [...Object.entries(value)].reduce(
        (p, [k, v]) => Object.assign(p, { [k]: deepCopy(v) }),
        {}
      );
    } else {
      return value;
    }
  }

  var storage = initPlugin;

  const {
    ConflictError: ConflictError$1,
    CredentialError: CredentialError$1,
    RequestError: RequestError$2,
  } = errors;

  function initPlugin$1(settings) {
    const identity = settings.identity;

    return function decorateContext(context, request) {
      context.auth = {
        register,
        login,
        logout,
      };

      const userToken = request.headers["x-authorization"];
      if (userToken !== undefined) {
        let user;
        const session = findSessionByToken(userToken);
        if (session !== undefined) {
          const userData = context.protectedStorage.get(
            "users",
            session.userId
          );
          if (userData !== undefined) {
            console.log("Authorized as " + userData[identity]);
            user = userData;
          }
        }
        if (user !== undefined) {
          context.user = user;
        } else {
          throw new CredentialError$1("Invalid access token");
        }
      }

      function register(body) {
        if (
          body.hasOwnProperty(identity) === false ||
          body.hasOwnProperty("password") === false ||
          body[identity].length == 0 ||
          body.password.length == 0
        ) {
          throw new RequestError$2("Missing fields");
        } else if (
          context.protectedStorage.query("users", {
            [identity]: body[identity],
          }).length !== 0
        ) {
          throw new ConflictError$1(
            `A user with the same ${identity} already exists`
          );
        } else {
          const newUser = Object.assign({}, body, {
            [identity]: body[identity],
            hashedPassword: hash(body.password),
          });
          const result = context.protectedStorage.add("users", newUser);
          delete result.hashedPassword;

          const session = saveSession(result._id);
          result.accessToken = session.accessToken;

          return result;
        }
      }

      function login(body) {
        const targetUser = context.protectedStorage.query("users", {
          [identity]: body[identity],
        });
        if (targetUser.length == 1) {
          if (hash(body.password) === targetUser[0].hashedPassword) {
            const result = targetUser[0];
            delete result.hashedPassword;

            const session = saveSession(result._id);
            result.accessToken = session.accessToken;

            return result;
          } else {
            throw new CredentialError$1("Login or password don't match");
          }
        } else {
          throw new CredentialError$1("Login or password don't match");
        }
      }

      function logout() {
        if (context.user !== undefined) {
          const session = findSessionByUserId(context.user._id);
          if (session !== undefined) {
            context.protectedStorage.delete("sessions", session._id);
          }
        } else {
          throw new CredentialError$1("User session does not exist");
        }
      }

      function saveSession(userId) {
        let session = context.protectedStorage.add("sessions", { userId });
        const accessToken = hash(session._id);
        session = context.protectedStorage.set(
          "sessions",
          session._id,
          Object.assign({ accessToken }, session)
        );
        return session;
      }

      function findSessionByToken(userToken) {
        return context.protectedStorage.query("sessions", {
          accessToken: userToken,
        })[0];
      }

      function findSessionByUserId(userId) {
        return context.protectedStorage.query("sessions", { userId })[0];
      }
    };
  }

  const secret = "This is not a production server";

  function hash(string) {
    const hash = crypto__default["default"].createHmac("sha256", secret);
    hash.update(string);
    return hash.digest("hex");
  }

  var auth = initPlugin$1;

  function initPlugin$2(settings) {
    const util = {
      throttle: false,
    };

    return function decoreateContext(context, request) {
      context.util = util;
    };
  }

  var util$2 = initPlugin$2;

  /*
   * This plugin requires auth and storage plugins
   */

  const {
    RequestError: RequestError$3,
    ConflictError: ConflictError$2,
    CredentialError: CredentialError$2,
    AuthorizationError: AuthorizationError$2,
  } = errors;

  function initPlugin$3(settings) {
    const actions = {
      GET: ".read",
      POST: ".create",
      PUT: ".update",
      PATCH: ".update",
      DELETE: ".delete",
    };
    const rules = Object.assign(
      {
        "*": {
          ".create": ["User"],
          ".update": ["Owner"],
          ".delete": ["Owner"],
        },
      },
      settings.rules
    );

    return function decorateContext(context, request) {
      // special rules (evaluated at run-time)
      const get = (collectionName, id) => {
        return context.storage.get(collectionName, id);
      };
      const isOwner = (user, object) => {
        return user._id == object._ownerId;
      };
      context.rules = {
        get,
        isOwner,
      };
      const isAdmin = request.headers.hasOwnProperty("x-admin");

      context.canAccess = canAccess;

      function canAccess(data, newData) {
        const user = context.user;
        const action = actions[request.method];
        let { rule, propRules } = getRule(
          action,
          context.params.collection,
          data
        );

        if (Array.isArray(rule)) {
          rule = checkRoles(rule, data);
        } else if (typeof rule == "string") {
          rule = !!eval(rule);
        }
        if (!rule && !isAdmin) {
          throw new CredentialError$2();
        }
        propRules.map((r) => applyPropRule(action, r, user, data, newData));
      }

      function applyPropRule(action, [prop, rule], user, data, newData) {
        // NOTE: user needs to be in scope for eval to work on certain rules
        if (typeof rule == "string") {
          rule = !!eval(rule);
        }

        if (rule == false) {
          if (action == ".create" || action == ".update") {
            delete newData[prop];
          } else if (action == ".read") {
            delete data[prop];
          }
        }
      }

      function checkRoles(roles, data, newData) {
        if (roles.includes("Guest")) {
          return true;
        } else if (!context.user && !isAdmin) {
          throw new AuthorizationError$2();
        } else if (roles.includes("User")) {
          return true;
        } else if (context.user && roles.includes("Owner")) {
          return context.user._id == data._ownerId;
        } else {
          return false;
        }
      }
    };

    function getRule(action, collection, data = {}) {
      let currentRule = ruleOrDefault(true, rules["*"][action]);
      let propRules = [];

      // Top-level rules for the collection
      const collectionRules = rules[collection];
      if (collectionRules !== undefined) {
        // Top-level rule for the specific action for the collection
        currentRule = ruleOrDefault(currentRule, collectionRules[action]);

        // Prop rules
        const allPropRules = collectionRules["*"];
        if (allPropRules !== undefined) {
          propRules = ruleOrDefault(
            propRules,
            getPropRule(allPropRules, action)
          );
        }

        // Rules by record id
        const recordRules = collectionRules[data._id];
        if (recordRules !== undefined) {
          currentRule = ruleOrDefault(currentRule, recordRules[action]);
          propRules = ruleOrDefault(
            propRules,
            getPropRule(recordRules, action)
          );
        }
      }

      return {
        rule: currentRule,
        propRules,
      };
    }

    function ruleOrDefault(current, rule) {
      return rule === undefined || rule.length === 0 ? current : rule;
    }

    function getPropRule(record, action) {
      const props = Object.entries(record)
        .filter(([k]) => k[0] != ".")
        .filter(([k, v]) => v.hasOwnProperty(action))
        .map(([k, v]) => [k, v[action]]);

      return props;
    }
  }

  var rules = initPlugin$3;

  var identity = "email";
  var protectedData = {
    users: {
      "35c62d76-8152-4626-8712-eeb96381bea8": {
        email: "peter@abv.bg",
        hashedPassword:
          "83313014ed3e2391aa1332615d2f053cf5c1bfe05ca1cbcb5582443822df6eb1",
      },
      "847ec027-f659-4086-8032-5173e2f9c93a": {
        email: "john@abv.bg",
        hashedPassword:
          "83313014ed3e2391aa1332615d2f053cf5c1bfe05ca1cbcb5582443822df6eb1",
      },
    },
    sessions: {},
  };
  var seedData = {
    games: {
      "ff436770-76c5-40e2-b231-77409eda7a61": {
        _ownerId: "35c62d76-8152-4626-8712-eeb96381bea8",
        title: "CoverFire",
        category: "Action",
        maxLevel: "70",
        imageUrl: "/images/CoverFire.png",
        summary:
          "Best action shooter game, easy controls, realistic 3D graphics and fun offline missions. Get your best shooting gun and take to action!",
        _createdOn: 1617194128618,
      },
      "1840a313-225c-416a-817a-9954d4609f7c": {
        _ownerId: "35c62d76-8152-4626-8712-eeb96381bea8",
        title: "MineCraft",
        category: "Arcade",
        maxLevel: "250",
        imageUrl: "/images/MineCraft.png",
        summary:
          "Set in a world where fantasy creatures live side by side with humans. A human cop is forced to work with an Orc to find a weapon everyone is prepared to kill for. Set in a world where fantasy creatures live side by side with humans. A human cop is forced to work with an Orc to find a weapon everyone is prepared to kill for.",
        _createdOn: 1617194210928,
      },
      "126777f5-3277-42ad-b874-76d043b069cb": {
        _ownerId: "847ec027-f659-4086-8032-5173e2f9c93a",
        title: "Zombie Lang",
        category: "Vertical Shooter",
        maxLevel: "100",
        imageUrl: "/images/ZombieLang.png",
        summary:
          "With it’s own unique story, set between the events of the first movie, Zombieland: Double Tap- Road Trip is a ridiculously fun top-down twin-stick shooter featuring local co-op multiplayer for up to four players. Play as your favorite heroes from the original — Tallahassee, Columbus, Wichita and Little Rock — as well as new unlockable characters from the upcoming sequel.  The game embraces the game-like elements seen in the film by  incorporating everything from the “Rules” to “Zombie Kill of the Week”.  Use your special abilities, an arsenal of weapons and the essential Zombieland rules for survival to stay alive against huge numbers of uniquely grotesque and dangerous undead monstrosities in Zombieland: Double Tap- Road Trip’s story-based campaign mode, wave-based horde mode, and boss battles.",
        _createdOn: 1617194295474,
      },
    },
    comments: {},

    products: {
      1001: {
        brand: "Adidas",
        gender: "women",
        price: 150,
        color: "white",
        size: 39,
        imageUrl:
          "https://s13emagst.akamaized.net/products/20352/20351519/images/res_1c1d600f17d4211cced9b89296b8ac16.jpg",
      },

      1002: {
        brand: "Adidas",
        gender: "women",
        price: 105,
        color: "white",
        size: 38,
        imageUrl:
          "https://img.eobuwie.cloud/eob_product_656w_656h(3/2/4/d/324d7fc038643ae651dd3fb93e1ff9b5826ffc6c_01_0000209025934_pl.jpg,webp)/obuvki-adidas-bryony-w-h04641-ftwwht-cblack-goldmt.webp",
      },

      1003: {
        brand: "Adidas",
        gender: "women",
        price: 173,
        color: "white",
        size: 38,
        imageUrl:
          "https://img.eobuwie.cloud/eob_product_656w_656h(9/6/f/2/96f2af440da722e97d5f07771c8b3b37be45aec0_0000206874566_1__az.jpg,webp)/obuvki-adidas-superstar-w-fx7483-ftwwht-goldmt-ftwwht-0000206874566.webp",
      },

      1004: {
        brand: "Adidas",
        gender: "women",
        price: 155,
        color: "white",
        size: 39,
        imageUrl:
          "https://img.eobuwie.cloud/eob_product_656w_656h(b/3/d/b/b3db004d8c932619aa9b6cb5f4acebab82ec2316_02_4066755355648_RP.jpg,webp)/obuvki-adidas-grand-court-cloudfoam-lifestyle-court-comfort-id4479-ftwwht-woncla-goldmt-0000302543847.webp",
      },

      1005: {
        brand: "Adidas",
        gender: "women",
        price: 129,
        color: "white",
        size: 40,
        imageUrl:
          "https://img.eobuwie.cloud/eob_product_656w_656h(8/b/5/4/8b543adf0a2e436b642d7d577931a23ace0330e3_01_0000301554950_SW.jpg,webp)/obuvki-adidas-zntasy-lightmotion-lifestyle-adult-shoe-hp6671-bial-0000301554950.webp",
      },

      1006: {
        brand: "Adidas",
        gender: "women",
        price: 139,
        color: "blue",
        size: 39,
        imageUrl:
          "https://img.eobuwie.cloud/eob_product_656w_656h(f/8/c/b/f8cb857baf619823a269f955b332dca69a9ed224_01_0000301555179_ki.jpg,webp)/obuvki-adidas-gazelle-shoes-hp2880-sin-0000301555179.webp",
      },

      1007: {
        brand: "Adidas",
        gender: "women",
        price: 130,
        color: "black",
        size: 39,
        imageUrl:
          "https://img.eobuwie.cloud/eob_product_1800w_1800h(1/3/2/b/132b77e1e417f621a7400f4b323e7754e64011cd_01_0000300586136_mt.jpg,webp)/obuvki-adidas-stan-smith-j-gy4254-cblack-ftwwht-goldmt.webp",
      },

      1008: {
        brand: "Adidas",
        gender: "women",
        price: 139,
        color: "black",
        size: 38,
        imageUrl:
          "https://img.eobuwie.cloud/eob_product_656w_656h(5/0/6/8/5068bb8ef480761a4aa8173a67bd28827bcd8fc0_02_4056566345396_mg.jpg,webp)/obuvki-adidas-gazelle-bb5476-cblack-white-goldmt-0000198734114.webp",
      },

      1009: {
        brand: "Adidas",
        gender: "women",
        price: 139,
        color: "black",
        size: 38,
        imageUrl:
          "https://img.eobuwie.cloud/eob_product_656w_656h(5/0/6/8/5068bb8ef480761a4aa8173a67bd28827bcd8fc0_02_4056566345396_mg.jpg,webp)/obuvki-adidas-gazelle-bb5476-cblack-white-goldmt-0000198734114.webp",
      },

      1010: {
        brand: "Adidas",
        gender: "women",
        price: 140,
        color: "pink",
        size: 38,
        imageUrl:
          "https://img.eobuwie.cloud/eob_product_656w_656h(e/7/8/a/e78a57179a7b5b439e9b1f2bce8c93c99008d681_02_0000301200925_is.jpg,webp)/obuvki-adidas-zntasy-lighmotion-hp6670-pink-0000301200925.webp",
      },

      1011: {
        brand: "Adidas",
        gender: "women",
        price: 110,
        color: "pink",
        size: 38,
        imageUrl:
          "https://img.eobuwie.cloud/eob_product_656w_656h(1/7/6/8/17681e4a93662039c569c556f8aeeb842206ad71_01_0000302298259_kt.jpg,webp)/obuvki-adidas-vl-court-2-0-h06114-pink-0000302298259.webp",
      },

      1012: {
        brand: "Nike",
        gender: "women",
        price: 150,
        color: "pink",
        size: 38,
        imageUrl:
          "https://img.eobuwie.cloud/eob_product_1800w_1800h(3/4/5/d/345df9f8e4434ccba6bbc82bbef98ef02316c34c_03_0000302927357_rz.jpg,webp)/obuvki-nike-dh8010-600-barefly-rose-summit-white-0000302927357.webp",
      },

      1013: {
        brand: "Nike",
        gender: "women",
        price: 99,
        color: "white",
        size: 38,
        imageUrl:
          "https://img.eobuwie.cloud/eob_product_1800w_1800h(f/c/b/9/fcb96f8a245262334f16b0cd82e905bb5c04988f_01_0000302741113_swa.jpg,webp)/obuvki-nike-cw5596-100-white-multicolor-black.webp",
      },

      1014: {
        brand: "Nike",
        gender: "women",
        price: 95,
        color: "white",
        size: 39,
        imageUrl:
          "https://img.eobuwie.cloud/eob_product_1800w_1800h(8/d/7/c/8d7ce9ac80c5f1d2eeafae1d5875941c46609ab0_01_0000301307129_ph.jpg,webp)/obuvki-nike-court-royale-2-nn-dh3159-100-white-white-white.webp",
      },

      1015: {
        brand: "Nike",
        gender: "women",
        price: 105,
        color: "black",
        size: 40,
        imageUrl:
          "https://img.eobuwie.cloud/eob_product_1800w_1800h(6/6/7/3/667391f042f938aa4889384f0120ab1da5ad323a_01_0000301212171_rz.jpg,webp)/obuvki-nike-dunk-low-se-dd7099-001-black-multi-color-black.webp",
      },

      1016: {
        brand: "Nike",
        gender: "women",
        price: 125,
        color: "black",
        size: 38,
        imageUrl:
          "https://img.eobuwie.cloud/eob_product_1800w_1800h(3/f/e/9/3fe93660bc77aa4b0dbad36e2d316a00f8927794_01_0000302368785_ki.jpg,webp)/obuvki-nike-tanjun-dj6257-001-black-mtlc-red-bronze.webp",
      },

      1017: {
        brand: "Nike",
        gender: "women",
        price: 159,
        color: "black",
        size: 40,
        imageUrl:
          "https://img.eobuwie.cloud/eob_product_1800w_1800h(2/d/2/5/2d257e0d5842043dd6df20480da919f5974cf56c_01_0000300882245_bs.jpg,webp)/obuvki-nike-court-legacy-nn-dh3162-001-black-white-1.webp",
      },

      1018: {
        brand: "Nike",
        gender: "women",
        price: 109,
        color: "blue",
        size: 40,
        imageUrl:
          "https://img.eobuwie.cloud/eob_product_656w_656h(7/0/2/e/702e1dc444827d0d4af38df5fe1d679985ab6a2c_02_0196605835342_EK.JPG,webp)/obuvki-nike-air-max-90-futura-fj4798-100-summit-white-cobalt-bliss-0000303343347.webp",
      },

      1019: {
        brand: "Nike",
        gender: "women",
        price: 96,
        color: "blue",
        size: 37,
        imageUrl:
          "https://img.eobuwie.cloud/eob_product_1800w_1800h(e/e/c/6/eec6a1b571f0ac3cfe87492b6552e5b139b89a9b_01_0000302365708_ks.jpg,webp)/obuvki-nike-md-valiant-gs-cn8558-405-marina-white-armory-navy.webp",
      },

      1020: {
        brand: "Puma",
        gender: "women",
        price: 91,
        color: "black",
        size: 37,
        imageUrl:
          "https://img.eobuwie.cloud/eob_product_1800w_1800h(5/2/7/4/52748db800026d2b68ce1149a6564e0855307395_10_0000301620341_ph.jpg,webp)/snikrsi-puma-vikky-v3-space-metallics-389334-01-puma-black-puma-gold-white.webp",
      },

      1021: {
        brand: "Puma",
        gender: "women",
        price: 85,
        color: "black",
        size: 38,
        imageUrl:
          "https://img.eobuwie.cloud/eob_product_1800w_1800h(2/5/f/8/25f8572bd68d5efcdc3c27dde973c50d7d086023_10_0000301624189_196.jpg,webp)/snikrsi-puma-wired-run-pre-jr-390847-06-puma-black-glowing-pink.webp",
      },

      1022: {
        brand: "Puma",
        gender: "women",
        price: 150,
        color: "black",
        size: 38,
        imageUrl:
          "https://img.eobuwie.cloud/eob_product_1800w_1800h(a/c/4/7/ac47e8ea0f24cedffe4a276fe8b3756bbf8de4be_01_0000301618249_pl.jpg,webp)/snikrsi-puma-jada-renew-laser-cut-389386-02-puma-black-gray-silver.webp",
      },

      1023: {
        brand: "Puma",
        gender: "women",
        price: 128,
        color: "pink",
        size: 39,
        imageUrl:
          "https://img.eobuwie.cloud/eob_product_1800w_1800h(7/1/8/8/7188d1314c7f376d76ad681b77da56d5fd43e9d1_01_0000301619703_ph.jpg,webp)/snikrsi-puma-rickie-387607-09-rose-dust-puma-white.webp",
      },

      1024: {
        brand: "Puma",
        gender: "women",
        price: 148,
        color: "pink",
        size: 39,
        imageUrl:
          "https://img.eobuwie.cloud/eob_product_656w_656h(b/9/d/c/b9dcf85bb557fd32802889a9472f071c15ee3631_0000209761139_01_rz.jpg,webp)/snikrsi-puma-st-runner-v3-l-384855-14-lotus-lotus.webp",
      },

      1025: {
        brand: "Puma",
        gender: "women",
        price: 87,
        color: "white",
        size: 37,
        imageUrl:
          "https://img.eobuwie.cloud/eob_product_656w_656h(5/c/a/2/5ca2f4672c2164bf79a05b01d077e945e5de46d6_10_0000301621928_rz.jpg,webp)/snikrsi-puma-jada-vacay-queen-jr-389750-03-white-lily-pink-black-gold.webp",
      },

      1026: {
        brand: "Puma",
        gender: "women",
        price: 95,
        color: "white",
        size: 37,
        imageUrl:
          "https://img.eobuwie.cloud/eob_product_656w_656h(5/4/8/7/5487863788e24c25a53eac7dc285bc5a2b1990ef_01_0000300997710_kt.jpg,webp)/snikrsi-puma-carina-2-0-holo-jr-387985-01-puma-white-puma-silver.webp",
      },

      1027: {
        brand: "Puma",
        gender: "women",
        price: 125,
        color: "white",
        size: 38,
        imageUrl:
          "https://img.eobuwie.cloud/eob_product_1800w_1800h(b/a/3/2/ba32b9e46e3dfbdb0669dfaefbe18ece2f87167f_01_0000301619161_rz.jpg,webp)/snikrsi-puma-vikky-v3-lthr-383115-11-puma-white-minty-burst-gold.webp",
      },

      1028: {
        brand: "Puma",
        gender: "women",
        price: 95,
        color: "blue",
        size: 39,
        imageUrl:
          "https://img.eobuwie.cloud/eob_product_656w_656h(7/9/3/3/7933e5f4a5417bb514e9c9d18c1ac43ecdf6c557_01_0000300971062_pa.jpg,webp)/snikrsi-puma-all-day-active-jr-387386-07-peacoat-white-high-risk-red.webp",
      },

      1029: {
        brand: "Kappa",
        gender: "women",
        price: 115,
        color: "white",
        size: 39,
        imageUrl:
          "https://img.eobuwie.cloud/eob_product_656w_656h(f/a/3/3/fa33dc614c22f1524c976481a2ca1ae74bf45677_02_0000302731879_is.jpg,webp)/snikrsi-kappa-243300-white-rose-1021-0000302731879.webp",
      },

      1030: {
        brand: "Kappa",
        gender: "women",
        price: 95,
        color: "black",
        size: 40,
        imageUrl:
          "https://img.eobuwie.cloud/eob_product_1800w_1800h(d/0/c/7/d0c7ddd3b08f384b99df3a903cf93b10e9e45cce_02_4066585101668_PL.jpg,webp)/snikrsi-kappa-243195-black-white-1110-0000301156994.webp",
      },

      1031: {
        brand: "Kappa",
        gender: "women",
        price: 79,
        color: "pink",
        size: 38,
        imageUrl:
          "https://img.eobuwie.cloud/eob_product_1800w_1800h(b/9/2/d/b92da048c88cada258935d2769f9db72af4f0c86_02_0000302731251_kt.jpg,webp)/snikrsi-kappa-getup-243102-lila-white-2310-0000302731251.webp",
      },

      1032: {
        brand: "Kappa",
        gender: "women",
        price: 105,
        color: "blue",
        size: 37,
        imageUrl:
          "https://img.eobuwie.cloud/eob_product_1800w_1800h(9/f/a/1/9fa1c34d36fc2df7d02f8e12d3dd762c7a8d561f_0000208958974_01_ts.jpg,webp)/snikrsi-kappa-242495-navy-mint-6737.webp",
      },
      1033: {
        brand: "Kappa",
        gender: "women",
        price: 105,
        color: "white",
        size: 40,
        imageUrl:
          "https://img.eobuwie.cloud/eob_product_656w_656h(9/8/1/8/9818017cdfb0e43d5aa9afb0bbe2552971c727e3_01_0000209879001_ph.jpg,webp)/snikrsi-kappa-243049-white-sand-1042.webp",
      },
      1034: {
        brand: "Adidas",
        gender: "men",
        price: 125,
        color: "white",
        size: 41,
        imageUrl:
          "https://img.eobuwie.cloud/eob_product_1800w_1800h(7/4/d/7/74d7495415845d42cd0777a0afe0ceea38281084_0000209023626_01_ph.jpg,webp)/obuvki-adidas-continental-80-stripes-fx5090-ftwwht-conavy-vivred.webp",
      },
      1035: {
        brand: "Adidas",
        gender: "men",
        price: 167,
        color: "white",
        size: 42,
        imageUrl:
          "https://img.eobuwie.cloud/eob_product_1800w_1800h(1/1/2/2/11224c148977c0e31e6a01a07ad6aecdb4e316cf_02_4064037429520_pa.jpg,webp)/obuvki-adidas-stan-smith-fx5501-ftwwht-ftwwht-conavy-0000207773479.webp",
      },
      1036: {
        brand: "Adidas",
        gender: "men",
        price: 153,
        color: "white",
        size: 41,
        imageUrl:
          "https://img.eobuwie.cloud/eob_product_1800w_1800h(7/b/1/d/7b1dbf419c6d2789f7cb89441e0b23cb8e41f832_0000199267376_01_wj,webp)/obuvki-adidas-gazelle-bb5498-ftwwht-ftwwht-goldmt.webp",
      },
      1037: {
        brand: "Adidas",
        gender: "men",
        price: 169,
        color: "pink",
        size: 42,
        imageUrl:
          "https://img.eobuwie.cloud/eob_product_1800w_1800h(2/a/9/6/2a96bd2af8a7093bf9283f9b34c84f95267530cb_02_0000302539086_bs.jpg,webp)/obuvki-adidas-avryn-shoes-id2411-pnkfus-cblack-shared-0000302539086.webp",
      },
      1038: {
        brand: "Adidas",
        gender: "men",
        price: 155,
        color: "black",
        size: 40,
        imageUrl:
          "https://img.eobuwie.cloud/eob_product_1800w_1800h(b/0/0/d/b00d2580928ede4db4508dfe1e2d6a6d000ebb48_02_0000302300631_ki.jpg,webp)/obuvki-adidas-heawyn-ig2381-black-0000302300631.webp",
      },

      1039: {
        brand: "Adidas",
        gender: "men",
        price: 171,
        color: "black",
        size: 42,
        imageUrl:
          "https://img.eobuwie.cloud/eob_product_1800w_1800h(4/a/c/0/4ac066544b10bc56135705ff86274f392f275c97_0000206712011_01__wj_1.jpg,webp)/obuvki-adidas-superstar-eg4959-cblack-ftwwht-cblack-0000206712011.webp",
      },
      1040: {
        brand: "Adidas",
        gender: "men",
        price: 101,
        color: "blue",
        size: 40,
        imageUrl:
          "https://img.eobuwie.cloud/eob_product_1800w_1800h(3/9/4/6/3946b4b47a2903ac26a35ea5499b7db014b28a55_02_0000302298815_is.jpg,webp)/obuvki-adidas-alphabounce-sustainable-bounce-lifestyle-running-shoes-ie9764-sin-0000302298815.webp",
      },
      1041: {
        brand: "Adidas",
        gender: "men",
        price: 164,
        color: "blue",
        size: 42,
        imageUrl:
          "https://img.eobuwie.cloud/eob_product_656w_656h(e/d/c/5/edc51128f0fb01b0e1f0ab778a2d3bf1c1d24234_01_0000300000687_ts,webp)/obuvki-adidas-multix-gw6835-pulblu-ftwwht-cblack.webp",
      },

      1042: {
        brand: "Nike",
        gender: "men",
        price: 144,
        color: "white",
        size: 40,
        imageUrl:
          "https://img.eobuwie.cloud/eob_product_656w_656h(2/9/c/c/29cc1136cbe85d6fcd545ff2a9d850cc891a41e9_02_0196151797545_rz.jpg,webp)/obuvki-nike-defyallday-dj1196-103-white-0000303298937.webp",
      },
      1043: {
        brand: "Nike",
        gender: "men",
        price: 159,
        color: "white",
        size: 41,
        imageUrl:
          "https://img.eobuwie.cloud/eob_product_656w_656h(a/8/0/4/a8044cf4696d8b1f9cf5234dab44fb70ff436753_0000209454574_01_pl.jpg,webp)/obuvki-nike-air-max-sc-cw4555-102-white-black-white.webp",
      },
      1044: {
        brand: "Nike",
        gender: "men",
        price: 109,
        color: "white",
        size: 41,
        imageUrl:
          "https://img.eobuwie.cloud/eob_product_1800w_1800h(3/3/9/4/3394c47beff98fb61bb736ffa8c7cbe2e292b5ac_0000209594522_01_mk.jpg,webp)/obuvki-nike-air-max-ap-cu4826-101-white-university-red-black.webp",
      },
      1045: {
        brand: "Nike",
        gender: "men",
        price: 126,
        color: "black",
        size: 41,
        imageUrl:
          "https://img.eobuwie.cloud/eob_product_1800w_1800h(9/2/b/8/92b8c06f238c11749fe6187e4ce0928b91b8be9e_0000300284872_01_rz_1.jpg,webp)/obuvki-nike-court-vision-lo-nn-dh2987-001-black-white-black.webp",
      },
      1046: {
        brand: "Nike",
        gender: "men",
        price: 106,
        color: "black",
        size: 40,
        imageUrl:
          "https://img.eobuwie.cloud/eob_product_656w_656h(d/5/0/c/d50ccd776e7c3b0c338054af6b3430ea05a56484_01_0000302669929_ki.jpg,webp)/obuvki-nike-air-max-excee-dq3993-001-anthracite-black-team-red.webp",
      },
      1047: {
        brand: "Nike",
        gender: "men",
        price: 96,
        color: "pink",
        size: 41,
        imageUrl:
          "https://img.eobuwie.cloud/eob_product_1800w_1800h(f/b/4/e/fb4eae5085459e25cc32339f4a60af50a24c6b3b_0000207862487_01_rz,webp)/obuvki-nike-air-ghost-racer-at5410-601-track-red-black-white.webp",
      },
      1048: {
        brand: "Nike",
        gender: "men",
        price: 112,
        color: "blue",
        size: 42,
        imageUrl:
          "https://img.eobuwie.cloud/eob_product_1800w_1800h(a/8/c/6/a8c6b6c5c58ebd402cada429ec91c8681695300a_02_0000303267841_KC.jpg,webp)/obuvki-nike-jordan-6-rings-322992-140-bial-0000303267841.webp",
      },
      1049: {
        brand: "Puma",
        gender: "men",
        price: 142,
        color: "white",
        size: 40,
        imageUrl:
          "https://img.eobuwie.cloud/eob_product_1800w_1800h(6/e/e/d/6eedbddad52d67dc1084eefdd8467afa4b90c6c9_01_0000301615637_rz.jpg,webp)/snikrsi-puma-rbd-game-low-386373-01-puma-white-puma-black-gold.webp",
      },
      1050: {
        brand: "Puma",
        gender: "men",
        price: 162,
        color: "white",
        size: 42,
        imageUrl:
          "https://img.eobuwie.cloud/eob_product_1800w_1800h(1/d/9/1/1d9194daeaf0758ee44e6f6a5e747cd80383c824_01_0000209781649_plj.jpg,webp)/snikrsi-puma-mirage-sport-re-style-384372-01-puma-white-gray-violet.webp",
      },
      1051: {
        brand: "Puma",
        gender: "men",
        price: 102,
        color: "black",
        size: 41,
        imageUrl:
          "https://img.eobuwie.cloud/eob_product_1800w_1800h(0/4/9/8/04984d1deabed04e45e7e100ec182a8bf1cbaabe_01_0000300998731_ts,webp)/snikrsi-puma-smash-v2-me-happy-386396-02-black-sun.webp",
      },
      1052: {
        brand: "Puma",
        gender: "men",
        price: 138,
        color: "black",
        size: 43,
        imageUrl:
          "https://img.eobuwie.cloud/eob_product_656w_656h(8/5/8/5/858552dc716bf1b91aebd183f51e30c66e2edb4a_01_0000301616245_RZ.jpg,webp)/snikrsi-puma-rs-x-3d-390025-01-puma-black-harbor-mist.webp",
      },
      1053: {
        brand: "Puma",
        gender: "men",
        price: 150,
        color: "pink",
        size: 40,
        imageUrl:
          "https://img.eobuwie.cloud/eob_product_1800w_1800h(3/5/6/3/3563d28f289cacd9d6a02f6e90b718927e9a3006_01_0000301011125_rz.jpg,webp)/snikrsi-puma-x-ray-2-square-373108-49-gray-v-black-d-shadow-l-lime.webp",
      },
      1053: {
        brand: "Kappa",
        gender: "men",
        price: 99,
        color: "white",
        size: 43,
        imageUrl:
          "https://img.eobuwie.cloud/eob_product_656w_656h(7/2/7/5/7275af1403922a9fbd0da264e90b0048c3879782_02_4066585090146_PL.jpg,webp)/snikrsi-kappa-243247-white-blue-1060-0000301158707.webp",
      },
      1054: {
        brand: "Kappa",
        gender: "men",
        price: 85,
        color: "white",
        size: 40,
        imageUrl:
          "https://img.eobuwie.cloud/eob_product_1800w_1800h(f/1/8/c/f18c68f5604e41080cbb75cdcd0136886684bfe3_01_0000209880557_ki.jpg,webp)/snikrsi-kappa-242765xl-white-red-1020.webp",
      },
      1055: {
        brand: "Kappa",
        gender: "men",
        price: 73,
        color: "black",
        size: 41,
        imageUrl:
          "https://img.eobuwie.cloud/eob_product_1800w_1800h(1/1/6/d/116de83f49e87117d2a34faefc399384724f2d94_02_0000302728527_DM.jpg,webp)/snikrsi-kappa-243140-black-white-1110-0000302728527.webp",
      },

      1056: {
        brand: "Kappa",
        gender: "men",
        price: 99,
        color: "blue",
        size: 43,
        imageUrl:
          "https://img.eobuwie.cloud/eob_product_1800w_1800h(f/c/2/a/fc2adce97d414555b52a9c638d6268f7d6f95463_0000200844909_01_de.jpg,webp)/snikrsi-kappa-242495-navy-white-6710.webp",
      },

      1057: {
        brand: "Kappa",
        gender: "men",
        price: 97,
        color: "pink",
        size: 41,
        imageUrl:
          "https://img.eobuwie.cloud/eob_product_1800w_1800h(8/9/6/0/8960f0f99da764e08b91e04da575abaea1ef810e_01_0000209878769_swa.jpg,webp)/snikrsi-kappa-243003-black-coral-1129.webp",
      },
      1058: {
        brand: "Kappa",
        gender: "men",
        price: 85,
        color: "white",
        size: 42,
        imageUrl:
          "https://img.eobuwie.cloud/eob_product_1800w_1800h(0/8/b/5/08b56365a3ab84fe9619ce4dd8c23dc98213b213_02_0000302729203_mt.jpg,webp)/snikrsi-kappa-243180-white-red-1020-0000302729203.webp",
      },
    },
  };
  var rules$1 = {
    users: {
      ".create": false,
      ".read": ["Owner"],
      ".update": false,
      ".delete": false,
    },
  };
  var settings = {
    identity: identity,
    protectedData: protectedData,
    seedData: seedData,
    rules: rules$1,
  };

  const plugins = [
    storage(settings),
    auth(settings),
    util$2(),
    rules(settings),
  ];

  const server = http__default["default"].createServer(
    requestHandler(plugins, services)
  );

  const port = 3030;
  server.listen(port);
  console.log(
    `Server started on port ${port}. You can make requests to http://localhost:${port}/`
  );
  console.log(`Admin panel located at http://localhost:${port}/admin`);

  var softuniPracticeServer = {};

  return softuniPracticeServer;
});
