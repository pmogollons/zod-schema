Package.describe({
  name: "pmogollons:zod-schema",
  version: "1.0.2",
  summary: "Meteor collection schema validation using zod",
  git: "https://github.com/pmogollons/zod-schema",
  documentation: "README.md",
});

Package.onUse(function (api) {
  api.versionsFrom(["3.0"]);

  api.use([
    "typescript",
    "ecmascript",
    "mongo",
    "check",
    "zodern:types@1.0.13",
  ]);

  api.mainModule("index.js", "server");
});

Package.onTest(function (api) {
  api.use("pmogollons:zod-schema");

  api.use([
    "mongo",
    "random",
    "tinytest",
    "ecmascript",
    "typescript",
  ]);

  api.mainModule("tests/index.js", "server");
});
