var http = require("http");
var fs = require("fs");
var qs = require("querystring");
var mongodb = require("mongodb");
var MongoClient = require("mongodb").MongoClient;
require("events").EventEmitter.prototype._maxListeners = 100;

var mongodbServer = new mongodb.Server("localhost", 27017, { auto_reconnect: true, poolSize: 10 });
var db = new mongodb.Db("database", mongodbServer);

var isTriedLogin = false, loginSuccess = false, insertSuccess = false;
var nameExists = false, emailExists = false;
var loginUserName = "", loginUserNum = 0;
var isGameAdded = false, isGameRemove = false, sub_list="";

var server = http.createServer(function(request, response) {
	if (request.method == "POST") {
		var formData = "", msg = "", obj = "";
		return request.on("data", function(data) {
			formData += data;
			return request.on("end", function() {
				var user;
				user = qs.parse(formData);
				msg = JSON.stringify(user);
				response.writeHead(200, {
					"Content-Type": "application/json",
					"Content-Length": msg.length
				});
				obj = JSON.parse(msg);
				
				if(request.url == "/login.html"){
					var ac = obj.ac;
					var pw = obj.pw;
					//var NorE = ac.includes("@");
					if (obj.act == "signup") {
						var email = obj.email;
						
						console.log("ac :"+ac+"\npw :"+pw+"\nemail:"+email);
						
						MongoClient.connect("mongodb://localhost:27017/database", function (err, db) {
							db.collection("user", function (err, collection) {
								//console.log("OK2");
								collection.find().toArray(function(err, items) {
									//console.log("OK3");
									if(err) throw err;
									//console.log("OK4");
									if (items != "") {
										for (var i=0; i<items.length; i++) {
											if (ac == items[i].ac) {
												nameExists = true;
											} else if (email == items[i].email) {
												emailExists = true;
											}
											if (ac == items[i].ac || email == items[i].email) {
												return;
											}
										}
									}
									insertUser(obj);
								});
							});	
						});
					}else if (obj.act == "login") {
						console.log("ac :"+ac+"\npw :"+pw);
						if(ac != "" && pw != "") {
							isTriedLogin = true;
						
							MongoClient.connect("mongodb://localhost:27017/database", function (err, db) {
								db.collection("user", function(err, collection){
									collection.find().toArray(function(err, items){
										if(err)throw err;
									
										if(items != ""){
											for(var i=0; i<items.length; i++){
												if(ac == items[i].ac && pw == items[i].pw){
													loginUserName = ac;
													loginUserNum = i;
													loginSuccess = true;
													console.log("Connected to account: "+ac);
												}
											}
										}
									});
								});
							});
						}
					}
				}
				
				if (request.url == "/index.html") {
					if(obj.act == "logout"){
						loginSuccess = false;
						console.log("Logout Success");
					} else if (obj.act == "sub_game"){
						MongoClient.connect("mongodb://localhost:27017/database", function (err, db) {
							db.collection("user", function (err, collection) {
								collection.update({ac: loginUserName}, { $push: { subscript: obj.game} }, {w:1}, function(err, result){
									if(err) throw err;    
									isGameAdded = true;
									console.log("one game added to subscription list");
								});
								collection.find().toArray(function(err, items) {
									if(err) throw err;
									
									sub_list = items[loginUserNum].subscript;
								});
							});		
						});
					} else if (obj.act == "remove_sub"){
						MongoClient.connect("mongodb://localhost:27017/database", function (err, db) {
							db.collection("user", function (err, collection) {
								collection.update({ac: loginUserName}, { $pull: { subscript: obj.game} }, {w:1}, function(err, result){
								if(err) throw err;
									isGameAdded = true;
									isGameRemove = true;
									console.log("one game removed from subscription list");
								});
								collection.find().toArray(function(err, items) {
									if(err) throw err;    
									sub_list = items[loginUserNum].subscript;
								});
							});
						});
					}	
				}
				return response.end();
			});
		});
	} else {
		fs.readFile("./" + request.url, function (err, data) {
			var dotoffset = request.url.lastIndexOf(".");
			var mimetype = dotoffset == -1
				? "text/plain"
				: {
					".html": "text/html",
					".ico" : "image/x-icon",
					".jpg" : "image/jpeg",
					".png" : "image/png",
					".gif" : "image/gif",
					".css" : "text/css",
					".js"  : "text/javascript"
				}[request.url.substr(dotoffset)];
			if (!err) {
				//response.setHeader("Content-Type", mimetype);
				response.end(data);
				console.log(request.url, mimetype);
			} else {
				response.writeHead(302, {"Location": "http://localhost:8000/index.html"});
				response.end();
			}
		});
	}
});

server.listen(8000);

console.log("Server running at http://127.0.0.1:8000/");

function insertUser(obj) {
	db.open(function() {
		db.collection("user", function(err, collection) {
			collection.insert({
				ac: obj.ac,
				pw: obj.pw,
				email: obj.email
			}, function(err, data){
				if(data){
					console.log("Added a new user to database");
					insertSuccess = true;
				} else {
					console.log("Fail to add a new user");
				}
			});
		});
	});
}

var io = require("socket.io").listen(server);

function update(){
	if(loginSuccess == true){
		io.emit("Login_Success",{message: "success", username: loginUserName, sub_list: sub_list});
	}else{
		if(isTriedLogin == true){
			io.emit("Login_Fail", {message: "failure"});
			isTriedLogin = false;
		}else{
			io.emit("no_user", {message: "failure"});
		}
	}
	
	//create user
	if(insertSuccess == true) {
		io.emit("Signup_Success", {message: "success"});
		insertSuccess = false;
	}
	
	//repeate account
	if(nameExists == true){
		io.emit("Username_repeat",{message: "failure"});
		nameExists = false;
	}else if (emailExists == true){
		io.emit("Email_repeat",{message: "failure"});
		emailExists = false;
	}
	
	if(isGameAdded == true){
		if(isGameRemove == false){
			io.emit("list_updated", {message: "success", sub_list: sub_list});
		} else {
			io.emit("game_removed", {message: "success", sub_list: sub_list});
			isGameRemove = false;
		}
		isGameAdded = false;
	}
}

setInterval(update, 500);