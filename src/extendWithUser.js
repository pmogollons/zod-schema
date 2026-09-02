export function extendWithUser(args, {
  isUpsert,
  isUpdate,
  isReplacementUpsert,
  existingDocument,
} = {}) {
  let userId;

  try {
    userId = Meteor.userId();
  } catch {
    // no userId in context
  }

  if (isReplacementUpsert && existingDocument) {
    if (Object.prototype.hasOwnProperty.call(existingDocument, "userId")) {
      args[1].userId = existingDocument.userId;
    } else {
      delete args[1].userId;
    }

    return;
  }

  if (!userId) {
    return;
  }

  if (isReplacementUpsert) {
    args[1].userId = userId;
  } else if (isUpsert) {
    args[1]["$setOnInsert"] = args[1]["$setOnInsert"] || {};
    args[1]["$setOnInsert"].userId = userId;
  } else if (isUpdate) {
    delete args[1]["$set"]?.userId;
  } else {
    args[0].userId = userId;
  }
}
