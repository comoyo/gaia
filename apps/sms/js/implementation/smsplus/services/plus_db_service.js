/*global IDBKeyRange Q indexedDB */
window.smsPlusIndexedDb = (function() {
  var deferredDb = Q.defer();
  var scopes = [];
  var resolve = function(deferred, result, eventName) {
    deferred.resolve(result);
    scopes.forEach(function(scope) {
      scope.$apply();
    });
  };

  var reject = function(deferred, result) {
    deferred.reject(result);
    scopes.forEach(function(scope) {
      scope.$apply();
    });
  };

  var publicDb = {

    addScope: function(scope) {
      scopes.push(scope);
    },

    openDb: function(name, version, stores, scope) {
      if (scope) {
        scopes.push(scope);
      }

      var req = indexedDB.open(name || 'default', version || 1);

      req.onupgradeneeded = function(evt) {
        var db = evt.target.result;

        stores.forEach(function(storeInfo) {
          var store = db.createObjectStore(storeInfo.name,
            storeInfo.properties);
          storeInfo.indices && storeInfo.indices.forEach(function(indexInfo) {
            store.createIndex(indexInfo.key, indexInfo.name,
              indexInfo.properties);
          });
        });
      };

      req.onsuccess = function(evt) {
        resolve(deferredDb, evt.target.result);
      };
      req.onerror = function(evt) {
        reject(deferredDb, evt);
      };

      return deferredDb.promise;
    },

    put: function(store, data, separate) {
      var deferred = Q.defer();

      deferredDb.promise.then(function(db) {
        var transaction = db.transaction(store, 'readwrite');
        transaction.oncomplete = function(evt) {
          resolve(deferred);
          //$rootScope.$broadcast('indexedDb.' + store, evt);
        };
        transaction.onerror = function(evt) {
          reject(deferred, evt);
        };

        if (separate && data instanceof Array) {
          data.forEach(function(record) {
            transaction.objectStore(store).put(record);
          });
        }
        else {
          transaction.objectStore(store).put(data);
        }
      },

      function(err) {
        deferred.reject(err);
      });

      return deferred.promise;
    },

    get: function(store, key, index) {
      var deferred = Q.defer();

      deferredDb.promise.then(function(db) {
        var transaction = db.transaction(store, 'readonly');
        transaction.onerror = function(evt) {
          reject(deferred, evt);
        };
        var location = !index ?
          transaction.objectStore(store) :
          transaction.objectStore(store).index(index);

        if (key) {
          var query = location.get(key);
          query.onsuccess = function(evt) {
            resolve(deferred, evt.target.result);
          };
          query.onerror = function(evt) {
            reject(deferred, evt);
          };
        }
        else {
          var result = [];
          var query = location.openCursor();
          query.onsuccess = function(evt) {
            var cursor = evt.target.result;
            if (cursor) {
              result.push(cursor.value);
              cursor.
              continue ();
            }
            else {
              resolve(deferred, result);
            }
          };
          query.onerror = function(evt) {
            reject(deferred, evt);
          };
        }
      },

      function(error) {
        reject(deferred, error);
      });

      return deferred.promise;
    },

    getRange: function(store, fromKey, toKey,
                        fromExclusive, toExclusive, index) {
      // Shuffle arguments
      if (fromExclusive && !(typeof fromExclusive == 'boolean')) {
        index = fromExclusive;
        fromExclusive = false;
      }

      var deferred = Q.defer();

      deferredDb.promise.then(function(db) {
        var transaction = db.transaction(store, 'readonly');
        transaction.onerror = function(evt) {
          reject(deferred, evt);
        };

        var location = !index ?
          transaction.objectStore(store) :
          transaction.objectStore(store).index(index);

        // like, kun nedre, kun øvre, begge
        var bound;
        if (!(fromKey && toKey)) {
          if (fromKey) bound = IDBKeyRange.lowerBound(fromKey, fromExclusive);
          else bound = IDBKeyRange.upperBound(toKey, fromExclusive);
        }
        else {
          bound = IDBKeyRange.bound(fromKey, toKey, fromExclusive, toExclusive);
        }
        if (fromKey === toKey) {
          bound = IDBKeyRange.only(fromKey);
        }
        var result = [];
        var query = location.openCursor(bound);
        query.onsuccess = function(evt) {
          var cursor = evt.target.result;
          if (cursor) {
            result.push(cursor.value);
            cursor.
            continue ();
          }
          else {
            resolve(deferred, result);
          }
        };
        query.onerror = function(evt) {
          reject(deferred, evt);
        };
      },

      function(error) {
        reject(deferred, error);
      });

      return deferred.promise;
    },

    // TODO: Automatically fetch keyPath form dbInfo
    update: function(store, key, data) {
      var deferred = Q.defer();
      deferredDb.promise.then(function(db) {
        var transaction = db.transaction(store, 'readwrite');
        transaction.onerror = function(evt) {
          reject(deferred, evt);
        };

        var location = transaction.objectStore(store);
        location.get(key).onsuccess = function(evt) {
          var item = {};
          [evt.target.result || {},
          data].forEach(function(obj) {
            Object.keys(obj).forEach(function(k) {
              item[k] = obj[k];
            });
          });

          location.put(item).onsuccess = function(evt) {
            deferred.resolve(evt.target.result);
          };
        };
      });

      return deferred.promise;
    },

    // TODO: Handle key
    remove: function(store, key) {
      var deferred = Q.defer();
      deferredDb.promise.then(function(db) {
        var transaction = db.transaction(store, 'readwrite');
        transaction.onerror = function(evt) {
          reject(deferred, evt);
        };

        var store = transaction.objectStore(store);
        store.clear().onsuccess = function(evt) {
          deferred.resolve(evt.target.result);
        };
      });

      return deferred.promise;
    }
  };

  return publicDb;
})();
