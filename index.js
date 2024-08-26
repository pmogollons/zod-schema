try {
  if (require("zod")) {
    import "./src/extendWithSchema";
  }
} catch {
  console.log("zod package not found. Without it you can't use zod-schema package.");
  console.log("Please install zod using meteor npm install zod");
}