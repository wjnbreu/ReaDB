
fetchBooks = function(search, sort, fields) {
  Meteor.call("fetchBooks", search, sort, fields, function(err,res){
    if (err){    
      throw err;
    } else if (res) {
      Session.set("books",JSON.parse(JSON.stringify(res)));  
      return JSON.parse(JSON.stringify(res));
    } else {
      return false;
    }
  });
}

fetchUsername = function(userId){
  Meteor.call("fetchUsername", userId, function(err, res){
    if (err) {
      console.log(err);  
      Session.set("fetchedUsername", err);
      throw err;
    } else if (res) {
      Session.set("fetchedUsername", res);
      return res;
    } else {
      Session.set("fetchedUsername", "not found");
      return false;    
    }
  });
  return Session.get("fetchedUsername");
}

fetchDisplayName = function(str){
  Meteor.call("fetchDisplayName", str, function(err, res){
    if (err) {
      console.log(err);  
      Session.set("displayName", err);
      throw err;
    } else if (res) {
      Session.set("displayName", res);
      return res;
    } else {
      Session.set("displayName", "user not found");
      return false;    
    }
  });
  return Session.get("displayName");
}

getUserStatistics = function(userId, query){
  Meteor.call("getUserStatistics", userId, query, function(err,res){
    if (err) {
      throw err;
    } else if (res) {
      Session.set("userStats", res);
      return res;
    } else {
      Bert.alert({
          title: 'Method call failed…',
          message: 'Failed to call Meteor method!',
          type: 'error',
        });
      return false;
    }
  })
}

processMethodResponse = function(err,res){
  if (err) {
    throw err;
  } else if (res) {
    return res;
  } else {
    Bert.alert({
        title: 'Method call failed…',
        message: 'Failed to call Meteor method!',
        type: 'error',
      });
    return false;
  }
}

PMR = function(err, res){
  return processMethodResponse(err, res);
}

toJSONString = function(data){
  var str = JSON.stringify(data);
  return str.substring(0, str.length - 0);
}

convertToCSV = function(objArray) {
    var array = typeof objArray != 'object' ? JSON.parse(objArray) : objArray;
    var str = '';
    for (var i = 0; i < array.length; i++) {
        var line = '';
        for (var index in array[i]) {
            if (line != '') line += ';'
            line += array[i][index];
        }
        str += line + '\r\n';
    }
    return str;
}

readFile = function(f, onLoadCallback) {
  //When the file is loaded the callback is called with the contents as a string
  var reader = new FileReader();
  reader.onload = function (e){
    var contents=e.target.result
    onLoadCallback(contents);
  }
  reader.readAsText(f);
};

processBookMetadata = function(bookId) {
    var tempData = Temp.findOne({"bookId":bookId});
    var metadataResponse = tempData.metadataResponse;
    var book = tempData.book;
    
    var isbn = book.isbn;   
    console.log(book.title);
    d = new Date();
    var dateModified = d.yyyymmdd();
    var dateReadSortable = new Date(book.dateRead).getTime() / 1000;     
    
    if(Session.get("metadataResponseIndex")){
      var metadataIndex = Session.get("metadataResponseIndex");
    } else {
      var metadataIndex = 0;
    }
  
    console.log("entering for loop");
    for (var n = metadataIndex; n < JSON.parse(metadataResponse).items.length; n++) {
      console.log("in for loop: " + n);
      
      // console.log(metadataResponse);
      var metadata = JSON.parse(metadataResponse).items[n];
      console.log(metadata);
  
      if (metadata.hasOwnProperty("volumeInfo") && metadata.volumeInfo.hasOwnProperty("industryIdentifiers")){
        if(!book.isbn) {
          var pIdObj = metadata.volumeInfo.industryIdentifiers;
          for (var i = 0; i < pIdObj.length; i++) {
            if (pIdObj[i].type == "ISBN_13") {
              isbn = pIdObj[i].identifier;
              break;
            }
          } 
          if (!isbn) {
            for (var i = 0; i < pIdObj.length; i++) {
              if (pIdObj[i].type == "ISBN_10") {
                isbn = pIdObj[i].identifier;
                break;
              }
            }
          }        
          if (!isbn) {
            for (var i = 0; i < pIdObj.length; i++) {
              isbn = pIdObj[0].identifier;  
              break;
            }
          }
        } else {
          break;
        }
      }
    }
  
    
    var updatedFields =  {             
      "isbn": isbn, 
      "title": book.title,
      "author": book.author,     
      "meta": {
        "userId": Meteor.userId(),
        "dateAdded": book.meta.dateAdded,
        "dateModified": dateModified,
        "dateReadSort": dateReadSortable
      },
      "publisherMetadata": {
        "pubdate": metadata.volumeInfo.publishedDate,
        "publisherDescription": metadata.volumeInfo.description,
        "pageCount": metadata.volumeInfo.pageCount,
        "publisherTitle": metadata.volumeInfo.title,
        "publisherAuthors": metadata.volumeInfo.author,
      }
    };
    
    if (metadata.volumeInfo.hasOwnProperty("imageLinks")){
      updatedFields.publisherMetadata["imgUrl"] = metadata.volumeInfo.imageLinks.thumbnail;
    }
    
    console.log(updatedFields);
    Meteor.call("deleteTempItem", tempData._id);
    Meteor.call("updateBookMetadata", bookId, updatedFields, function(err, res){
      if(res){
        Bert.alert({
            title: book.title+' Metadata Updated!',
            message: 'Found metadata for '+ book.title +' using Google Books API',
            type: 'success',
          });
        return true;
      } if (err) {
        throw err;
      }
    });
}

updateBookMetadata = function(bookId) {
  Meteor.call("fetchBook", bookId, function(err,res){
    if (err) {
      throw err;
    } else if (res) {
      var book = res;
      var isbn =  book.isbn;
      var title = book.title;
      var author = book.author;
      Meteor.call("fetchBookMetadata", isbn, title, author, function(err,res){
        if(res){
          
          if(JSON.parse(res.content).totalItems > 0){
            var tempObject = {
              "userId": Meteor.userId(),
              "bookId": book._id,
              "book": book,
              "metadataResponse": res.content
            }
            var existingBookTempItem = Temp.findOne({"bookId":book._id});
            if (existingBookTempItem){
              Meteor.call("updateTempItem", existingBookTempItem._id, tempObject, function(err,res){
                if(res) {
                  console.log(bookId);
                  processBookMetadata(bookId);
                } else {
                  throw(err);
                }  
              });
            } else {
              Meteor.call("insertTempItem", tempObject, function(){
                if(res) {
                  processBookMetadata(bookId);
                } else {
                  throw(err);
                }
              });
            }
          } else if (JSON.parse(res.content).stack) {
            console.log(JSON.parse(res.content).stack);
            Bert.alert({
              title: 'That’s all we can do for now',
              message: 'We’ve fetched metadata for as many books as the Google Books API allows. Wait an hour or so and then we can update the rest.',
              type: 'warning',
            });
            return false;
          } else {
            return false;
          }
        } if (err){
          throw error;
        } else {
          return false;
        }
      });
    }
  });
  
}

updateLibraryMetadata = function(){
  console.log("update lib meta called");
  fetchBooks();
  var library = Session.get("books");
  var totalBooksProcessed = 0;
  var totalBooksUpdated = 0;    
  for(var i = 0; i < library.length; i++){
    console.log("in for loop");
    totalBooksProcessed++;
    Session.set("updateStatus", "<i class='fa fa-spinner'></i> processing book "+totalBooksProcessed+" of "+library.length);   
    var book = library[i];
    if (!book.hasOwnProperty("publisherMetadata") || !book.publisherMetadata.hasOwnProperty("pubdate") ){
      console.log(book.title);
      console.log(book.meta);
      totalBooksUpdated = totalBooksUpdated + 1;
      // updateUserSession(toString(totalBooksUpdated));
      updateBookMetadata(book._id);
    } else {
      Bert.alert({
        title: book.title+' already has metadata'
      });
    }
  } // end for loop
}, // end function

deleteBook = function(bookId) {
  Meteor.call("deleteBook", bookId, function(err,res){
    if (err) throw err;
    if (res) return res;
    else {
      Bert.alert({
          title: 'Oops!',
          message: 'That book doesn’t seem to belong to you…',
          type: 'danger',
        });
    }
  });
}

truncate = function(str, end, char){
  if (str.length > end){
    var trimmedStr = str.substring( 0, end);
    // Don’t trim in the middle of a word…
    trimmedStr = trimmedStr.substr(0, Math.min(trimmedStr.length,         trimmedStr.lastIndexOf(" ")));
     if (char) {
       trimmedStr += char;
     }
   } else {
     var trimmedStr = str;
   }
   return trimmedStr;
 }

slugify = function(str){  
  var trimmedStr =  truncate(str, 100);  
  // trimmedStr.replace(/&lt;br&gt;/g," ");
  var cleanedStr = trimmedStr.replace(/(<|&lt;)br\s*\/*(>|&gt;)/g,' ');

  return cleanedStr.toString().toLowerCase().trim()
    .replace(/\s+/g, '-')           // Replace spaces with -
    .replace(/&/g, '-and-')         // Replace & with 'and'
    .replace(/[^\w\-]+/g, '')       // Remove all non-word chars
    .replace(/\-\-+/g, '-');        // Replace multiple - with single -
}

trim11 = function(str) {
  str = str.replace(/^\s+/, '');
  for (var i = str.length - 1; i >= 0; i--) {
    if (/\S/.test(str.charAt(i))) {
      str = str.substring(0, i + 1);
      break;
    }
  }
  return str;
}

tagsToArray = function(tags){
  var tagArray = [];
  tagArray = tags.split(',');
  for(var i = 0; i < tagArray.length; i++){
    tagArray[i] = trim11(tagArray[i]);
  }
  return tagArray;
}

appendScript = function(pathToScript) {
  var body = document.getElementsByTagName("body")[0];
  var js = document.createElement("script");
  js.type = "text/javascript";
  js.src = pathToScript;
  console.log("Appending script:");
  console.log(pathToScript);
  body.appendChild(js);
}

removeScript = function(pathToScript) {
  var body = document.getElementsByTagName("body")[0];
  var scripts = body.getElementsByTagName("script");
  for (var i = 0; i < scripts.length; i++) {
    var js = scripts[i];
    if (js.src == pathToScript) {
      body.removeChild(js);
      break;
      
    }
  }
}
// 
// getLoginServices = function () {
//   var self = this;
// 
//   // First look for OAuth services.
//   var services = Package['accounts-oauth'] ? Accounts.oauth.serviceNames() : [];
// 
//   // Be equally kind to all login services. This also preserves
//   // backwards-compatibility. (But maybe order should be
//   // configurable?)
//   services.sort();
// 
//   // Add password, if it's there; it must come last.
//   if (hasPasswordService())
//     services.push('password');
// 
//   return _.map(services, function(name) {
//     return {name: name};
//   });
// };
// 
// dropdown = function () {
//   return hasPasswordService() || getLoginServices().length > 1;
// };