# Nova | Grapher 2.0 

**NOVA** is a Data Fetching Layer on top of [bluelibs/nova](https://www.bluelibs.com/docs/package-nova), [Meteor](https://www.meteor.com/) and [MongoDB](https://www.mongodb.com/).

How to install:
```bash
meteor add pmogollons:nova
```

Companion packages
* [grapher-react-native](https://github.com/pmogollons/grapher-react-native)

### Differences with the original Grapher:
* No pub/sub (no reactivity), only methods
* No meta links and meta filters
* No linker engine (removed getLink, set, unset, add, remove, metadata)
* No $postFilters or $postOptions
* All reducers reduce function should be async
* Removed fetch, fetchSync, fetchOne and fetchOneSync, now use fetchAsync and fetchOneAsync
* No denormalization
* No global or collection expose
* No graphQL bridge
* foreignIdentityField is now foreignField

### Changes and new features:
* Firewalls and reducers are async
* [Filtered links (new)](https://www.bluelibs.com/docs/package-nova/#filtered-links)
* [Link aliasing (new)](https://www.bluelibs.com/docs/package-nova/#aliasing)
*  [$ key for filters and options (new)](https://www.bluelibs.com/docs/package-nova/#querying)
* [Support to hook into the mongodb pipeline for advanced queries (new)](https://www.bluelibs.com/docs/package-nova/#relational-filtering-and-sorting)
* [Dynamic filters (new)](https://www.bluelibs.com/docs/package-nova/#dynamic-filters)
* Reducers have extendable context with userId (new)
* Support for transactions (new)
* cache option for exposures (new)

## [Documentation](docs/index.md)

This provides a learning curve for Nova, and it explains most basic the features. If you want to visualize the documentation better, check it out here:

## [API](https://www.bluelibs.com/docs/package-nova)