
/////////////////////////////Web Socket Server//////////////////////////////


var WebSocketServer = require('ws').Server,
wss = new WebSocketServer({port: 10571});

wss.on('close', function() {
	console.log('disconnected');

});

wss.broadcastToAll = function(eventName, eventData){
	var i;
	for(i=0;i<this.clients.length;i++){
        sendToClientDispatch(this.clients[i], eventName, eventData);
	}
}

wss.broadcastDraw = function(stage){
    var i;

	for(i=0;i<stage.clients.length;i++){

	    var client = stage.clients[i];
	    sendToClientDispatch(client, "draw", stage.packedActors);

	    if (client.player != null){

	    sendToClientDispatch(client, "drawPlayer", client.player.getCoords());
	}
	}

}

wss.broadcastCommand = function(world, command, message){

	stage = worlds[world];
	var i;
    for(i=0;i<stage.clients.length;i++){

    	var client = stage.clients[i];
        sendToClientDispatch(client, command, message);
    }
}

wss.on('connection', function(ws) {


	loadSelection(ws);


	ws.on('message', function(message) {

	var json = JSON.parse(message);

	serverDispatch(ws, json.command, json.params);


	});

	ws.on('close', function(message) {


		if (this.player != null)

			exitWorld(this, "exit");
	});

});

//A mapping of worldnames to all worlds
var worlds={};
/////////////////////////////Web Socket Functions//////////////////////////////

///////////////////////////////////////////////////////////////////////////
//////////////////////Client Request Processing////////////////////////////
///////////////////////////////////////////////////////////////////////////


function sendToClientDispatch(socket, eventName, eventData){
	/*
	Packages information so that eventName is executed by the client with
	eventData by following the event driven payload-serverDispatch system that has
	been implemented
	*/

    if(socket.readyState!= 1) return;

    payload = JSON.stringify({command:eventName, params:eventData});
   	socket.send(payload);
}

///////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////

function loadSelection (socket){
	/*Load the buttons for preexisting worlds*/

	for(var world in worlds) {
		sendToClientDispatch(socket,"addButton", {worldName:world, worldCount: worlds[world].clients.length});

	}
}


///////////////////////////////////////////////////////////////////////////
/////////////////////////Response Processing///////////////////////////////
///////////////////////////////////////////////////////////////////////////
function serverDispatch(socket, command, params){

	switch(command){

		case "newWorld":
			newWorld(socket, params.world, params.stageSize, params.numMon, params.followMonster);
			break;

		case "enterWorld":

			socket.world = params.world;

			socket.player = enterWorld(socket, params.playerType);




			break;

		case "exitWorld":
			exitWorld(socket, "exit");


			break;

		case "movePlayer":

			movePlayer(socket, params.newX, params.newY);
			break;
		case "moveBox":

			moveBox(socket, params.newX, params.newY);
			break;

	}

}

function newWorld(socket, worldName, stageSize, numMonsters, followMonster){

	if (worldName in worlds){

		sendToClientDispatch(socket, "notify", "Name Already Used");
		return;
	}

	var stage = new Stage(worldName, stageSize);
	stage.initialize(numMonsters, stageSize, followMonster);
	worlds[worldName] = stage;

	wss.broadcastToAll("addButton", {worldName:worldName, worldCount: worlds[worldName].clients.length});

}

function enterWorld(socket, playerType){

	var stage = worlds[socket.world];

	stage.clients.push(socket);

	if (playerType == "Player"){
		playerType = Player;
	}
	else if (playerType == "Slayer"){
		playerType = Slayer;
	}

	var player = stage.genActors(playerType, 1);
	player.client = socket;



	sendToClientDispatch(socket, "setupGameBoard", {len:stage.height,
						 wid:stage.width , worldName: socket.world});

	wss.broadcastToAll("updateWorldCount",  {worldName:socket.world,
			worldCount:worlds[socket.world].clients.length});


	stage.pack();
	sendToClientDispatch(socket,"draw", stage.packedActors);

	return player;
}

function exitWorld(socket, state){


	stage = worlds[socket.world];
	actor = socket.player;

	stage.clients.splice(stage.clients.indexOf(socket), 1);

	wss.broadcastToAll("updateWorldCount", {worldName:socket.world,
						worldCount:stage.clients.length});

	sendToClientDispatch(socket, "leaveGameBoard", state);

	socket.world = null;
	socket.player = null;

	if (stage.actors.indexOf(actor) > 0){
		stage.removeActor(actor);}

}

function movePlayer(socket, dx, dy){

	//sending info through home page after dead
	if (socket.player != null)
	socket.player.move(socket.player, dx, dy);
}
function moveBox(socket, dx, dy){

	if (socket.player == null) return;
	   for(var i=0;i<socket.player.stage.actors.length;i++){
        var actor=socket.player.stage.actors[i];
        if (actor instanceof Box) {
        	actor.move(this.player, dx, dy);
        }
        if (actor instanceof FollowMonster){
            socket.player.stage.packedActors["FollowMonster"].push([actor.x, actor.y]);
        }
        if (actor instanceof Monster){
            socket.player.stage.packedActors["Monster"].push([actor.x, actor.y]);
        }

    }

}

///////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////

///////////////////////////////////////////////////////////////////////////
///////////////////////////////////GAME////////////////////////////////////
///////////////////////////////////////////////////////////////////////////



interval = setInterval(update,250);

function update(){

	for (var world in worlds){

		stage = worlds[world];
		stage.step();
		wss.broadcastDraw(stage);
		stage.packedActors = {"Monster":[], "FollowMonster":[], "Player":[], "Slayer":[],
											"Box":[], "Wall":[], "Blank":[] };

		if (stage.gameOver()) {
			wss.broadcastCommand(world, "leaveGameBoard", "win");
			wss.broadcastToAll("rmButton",  world);
			delete worlds[world];

		}
	}
}


//Start Stage Prototype #####################################
function Stage(name, stageSize){

    this.name =name;
    this.width=stageSize;
    this.height=stageSize;

    this.actors=[];
    this.clients=[];
    this.packedActors = {"Monster":[],"FollowMonster":[], "Player":[], "Slayer":[],
											"Box":[], "Wall":[], "Blank":[] };

}

Stage.prototype.pack=function(){

    var actors = this.actors;
    for(var i=0;i<actors.length;i++){

		this.packedActors[this.actorStringify(actors[i])].push(actors[i].getCoords());
    }
}


Stage.prototype.actorStringify=function(actor){

    if (actor instanceof FollowMonster) return "FollowMonster";
    if (actor instanceof Monster) return "Monster";
    if (actor instanceof Slayer) return "Slayer";
    if (actor instanceof Player) return "Player";

    if (actor instanceof Wall) return "Wall";
    if (actor instanceof Box) return "Box";

}

Stage.prototype.setPlayer=function(player){
    /*
    A Player is a special actor, self may need to contact them
    directly
    */
    this.setPlayer(new Player(this.playerImageSrc,
            Math.floor(this.width/2),Math.floor(this.height/2), this));
    this.players.push(player);
    this.Actor(this.player);
}

// initialize an instance of the game
Stage.prototype.initialize=function(numMonsters, stageSize, followMonster){

    // Add walls around the outstageSize of the stage,
    // so actors can't leave the stage
    this.genBounds(Wall);

    //Standard Monsters
   	this.genActors(Monster, numMonsters);
    if (followMonster)
        this.genActors(FollowMonster, 1);

    // Add in some Boxes
    this.genActors(Box, (stageSize*stageSize)/5 );

}

Stage.prototype.genBounds=function(archetype){
    /*
    Generate walls around the bounds of the stage
    */

    for (i = 0; i < this.width; i++){
        this.addActor(new archetype( i, 0, this));
        this.addActor(new archetype( i, this.height-1, this));
    }
    for (j = 0; j < this.height; j++){
        this.addActor(new archetype(0, j, this));
        this.addActor(new archetype(this.width-1, j, this));

    }
}
Stage.prototype.genActors=function(archetype, amt){
    /*
    Generate actors of prototype "archetype" and randomly place them
    throughout the stage
    */

    var num=0;
    while (num < amt){

        x=Math.floor((Math.random() * (this.width-2)) + 1);
        y=Math.floor((Math.random() * (this.height-2)) + 1);

        var actor = new archetype(x, y, this);
        if (this.getActor(x,y) == null){
            this.addActor(actor);
            num+=1;
            if ((archetype === Player)||(archetype === Slayer)){

            	return actor;
    		}
        }


	}
}

//getters and setters with obvious functionality
// Return the ID of a particular image, useful so we don't have to continually reconstruct IDs
Stage.prototype.getStageId=function(x,y){ return x +','+y; }
Stage.prototype.isInBoundsX=function(x){return (0 <= x && x < this.width);}
Stage.prototype.isInBoundsY=function(y){return (0 <= y && y < this.height);}
Stage.prototype.isInBounds=function(x, y){
    return this.isInBoundsX(x) && this.isInBoundsY(y);
}

//add an actor to the stage actor list
Stage.prototype.addActor=function(actor){ this.actors.push(actor);}


Stage.prototype.getActor=function(x, y){
    /*
    Return the first actor at coordinates (x,y) return null
    if there is no such actor there should be only one actor at (x,y)!
    */

    for(var i=0;i<this.actors.length;i++){
        var actor = this.actors[i];
        if (actor.getXPos()==x && actor.getYPos()==y) return actor;
    }
    return null;
}

Stage.prototype.removeActor=function(actor){
	var actors = this.actors;
	for(var i = 0; i<this.actors.length; i++){

		if(actors[i] == actor){

			this.packedActors["Blank"].push([actor.x, actor.y]);
			this.actors.splice(i, 1);
			delete actor;
		}
	}

}



Stage.prototype.step=function(){
    // Make each actor take one step in the animation of the game.
    for(var i=0;i<this.actors.length;i++){
        this.actors[i].step();
    }
}

Stage.prototype.gameOver=function(){
    /*
    Return the status of the game
    */

    for(var i=0;i<this.actors.length;i++){
        var actor=this.actors[i];
        if (actor instanceof Monster) return false;
    }
    return true;
}
//Start End Prototype #####################################




//Start Actor Prototype #############################################
function Actor(x, y, stage){
    /*
    Something occupying a space on the stage that has an icon, position,
    and can be moved, killed (removed from the stage), or evolved.
    */

    this.x = x;
    this.y = y;
    this.stage = stage;
    this.isDead = false;
}

//Getters and Setters with obvious functionalities
Actor.prototype.getStage=function(){return this.stage;}
Actor.prototype.getXPos=function(){return this.x;}
Actor.prototype.getYPos=function(){return this.y;}
Actor.prototype.getCoords=function(){return [this.x, this.y]}
Actor.prototype.getIsDead=function(){return this.isDead;}
Actor.prototype.setDead=function(){return this.isDead = true;}
Actor.prototype.setPosition=function(newX, newY){
    this.x = newX; this.y = newY;
}

Actor.prototype.kill=function(){
    /*
    After setting the actor dead, remove it from the stage and reset
    its image.
    */

    this.setDead();
    this.getStage().removeActor(this);

}



Actor.prototype.infrontMoveable=function(newX, newY, dx, dy){
    /*
    After asking the Actor at newX and newY (with respect to
    this) to move dx, dy, return whether the Actor infront moved
    and move accordingly
    */

    infront = this.getStage().getActor(newX, newY);
        if ((infront != null) && !infront.move(this, dx, dy))
            return false;

    return true;
}

Actor.prototype.step=function(id){
    /*
    this takes a single step in the animation of the game.
    this can ask the stage to help as well as ask other Actors
    to help fulfill its directive later on. Also ensures actors
    are always drawn to there locations (first time- ie stage
    generation and last time)
    */

    if(this.getIsDead()){
        Actor.prototype.kill.call(this);
        return;
    }

}

Actor.prototype.move=function(actor, dx, dy){
    /*
    actor is telling this to move in direction (dx, dy), this will
    move if no conditions of the game are violated and reset
    images accordingly
    */

    var oldX = this.getXPos()
    var oldY = this.getYPos()
    var newX = oldX + dx;
    var newY = oldY + dy;
    var stage = this.getStage();

    if (this.infrontMoveable(newX, newY, dx, dy)
        && stage.isInBounds(newX, newY))
    {

        this.setPosition(newX, newY);

        behind = this.getStage().getActor(oldX-dx, oldY-dy);
        if ((actor instanceof Box)&& (behind instanceof Wall)){
        	this.stage.packedActors["Blank"].push([oldX, oldY])
        }
        if (!((actor instanceof Box)&& (behind != null))){
        	this.stage.packedActors["Blank"].push([oldX, oldY]);
        }



        this.stage.packedActors[this.stage.actorStringify(this)].push([newX, newY]);

        return true;
    }
    return false;
}

//End Actor Prototype ################################################


//Start Box Prototype #####################################
Box.prototype = new Actor();
function Box( x, y, stage){
    /*
    An actor that can be moved around by Player and trap monsters (may
    have special abilities)
    */
    Actor.call(this, x, y, stage);
}
Box.prototype.move=function(actor, dx, dy){
    /*
    actor is telling us to move in direction (dx, dy), move
    (when possible) and return whether moved in that direction.
    */
    if ((actor instanceof Monster)||(actor instanceof Slayer)) return false;
    return Actor.prototype.move.call(this, this, dx, dy);
}
//End Box Prototype #####################################

//Start Wall Prototype #####################################
Wall.prototype = new Box();
function Wall(x,y, stage){
    /*
    A special kind of Box that cannot be moved
    */
    Box.call(this,x, y, stage);
}

Wall.prototype.move=function(actor, dx, dy){return false;}
//End Wall Prototype #####################################

//Start Player Prototype #############################################
Player.prototype = new Actor();//Prototypal inheritance protocal
function Player( x, y, stage){
    /*
    A Player is an Actor that can handle events. These typically come
    from the user, for example key presses etc.
    */

	Actor.call(this, x, y, stage);
}

Player.prototype.kill=function(){
    /*
    After setting the actor dead, remove it from the stage and reset
    its image.
    */

    exitWorld(this.client, "lose");

}


Player.prototype.move=function(actor, dx, dy){
    if (actor != this) return false;//no one pushes this around
    return Actor.prototype.move.call(this, actor, dx, dy);
}


//End Player Prototype #############################################


//Start Player Prototype #############################################
Slayer.prototype = new Player();//Prototypal inheritance protocal
function Slayer( x, y, stage){
    /*
    A Player is an Actor that can handle events. These typically come
    from the user, for example key presses etc.
    */

	Player.call(this, x, y, stage);
}

Slayer.prototype.step=function(actor, dx, dy){

	var surr = [];
    for(var x=-1; x<2; x++){
        for(var y=-1; y<2; y++){

            var around = this.getStage().getActor(this.getXPos()+x,
                                                   this.getYPos()+y);
            if (around != this) surr.push(around instanceof Box);
        }
    }
     if (surr.indexOf(false) != -1){
       // this.move(this, this.dx, this.dy);
    }else{
        if (!this.getIsDead()) this.kill();
    }
    Actor.prototype.step.call(this);
	//Monster.prototype.step.call(this);
}

Slayer.prototype.move=function(actor, dx, dy){

    if (actor != this) return false;
    if (!(actor instanceof Slayer) && (actor instanceof Player)) {
    	actor.kill();
    }

    infront = this.getStage().getActor(this.x+dx, this.y+dy);
    if (infront instanceof Player){
        infront.kill();
    }

    return Actor.prototype.move.call(this, actor, dx, dy);
}


//End Player Prototype #############################################


//Start Monster Prototype #############################################
Monster.prototype = new Actor();
function Monster(x, y, stage, delay){
    /*
    A special type of actor that kills players and moves independently
    at a pace defined by delay
    */

    Actor.call(this, x, y, stage);
    if (delay == null) delay = 5;
    this.delay=delay;
    this.delayCount=0;
}

Monster.prototype.kill=function(){
    this.getStage().numKilledMonsters++;

    Actor.prototype.kill.call(this);
}
Monster.prototype.isDelay=function(){
    /*
    Used to change this's speed relative to other Actors
    each step, the function determines if the actor should
    move.
    */

    this.delayCount=(this.delayCount+1)% this.delay;
    // When count wraps around to 0, do something.
    return this.delayCount==0;
}
Monster.prototype.getSurroundings=function(){
    /*
    returns an array of the actors surrounding this
    */
    var surr = [];
    for(var x=-1; x<2; x++){
        for(var y=-1; y<2; y++){

            var around = this.getStage().getActor(this.getXPos()+x,
                                                   this.getYPos()+y);
            if (around != this) surr.push(around instanceof Box);
        }
    }
    return surr;
}
Monster.prototype.step=function(){
    /*
    this takes a single step in the animation of the game.
    Also removes dead monsters or delays them accordingly
    */

    if (!this.isDelay()) return;

    surr = this.getSurroundings();

    if (surr.indexOf(false) != -1){
        this.move(this, this.dx, this.dy);
    }else{
        if (!this.getIsDead()) this.kill();
    }
    Actor.prototype.step.call(this);
}

//RndMove and StdMove
Monster.prototype.randPos=function(dx, dy){
    /*
    check the dx and dy to ensure they meet requirements of the game.
    If dx and dy do not exist, assign random numbers. Once, chosen
    fulfill monster directives accordingly
    */

    var looped = false;
    do{
        //incase preentered values exist
        if ((dx == null && dy == null) || looped){
            dx = Math.floor((Math.random() * (3) -1));
            dy = Math.floor((Math.random() * (3) -1));
        }

        newX = this.getXPos() + dx;
        newY = this.getYPos() + dy;

        //monster directives
        infront = this.getStage().getActor(newX, newY);
        if (!(infront instanceof Slayer)&&(infront instanceof Player)){
            infront.kill();
        }


        looped = true;//ensures rand dx and dy re-loop
     } while(!this.getStage().isInBounds(newX, newY) || infront != null)

     return [dx, dy];

}
Monster.prototype.move=function(actor, dx, dy){
    /*
    Determine a position and move there, kill players and fulfill
    monster directives accordingly
    */

    if (!(actor instanceof Slayer)&&(actor instanceof Player)){
    	actor.kill();
    }
    if (actor != this) return false;

    pos = this.randPos(dx, dy);

    if (!this.getIsDead())
        return Actor.prototype.move.call(this, actor, pos[0], pos[1]);

    return false;

}


//End Monster Prototype #############################################

//Start FollowMonster Prototype #####################################
FollowMonster.prototype = new Monster();
function FollowMonster(x, y, stage, delay){
    /*
    A special kind of monster that follows the player around
    */
    if (delay == null) delay = 3;
    Monster.call(this, x, y, stage, delay);
}

FollowMonster.prototype.getDir=function(ref, pos){
    /*
    Use refs position to return the pos in the direction of ref.
    */

    if (ref == pos){
        return 0;
    }else if (ref < pos){
        return -1;
    }else{
        return 1;
    }
}
FollowMonster.prototype.step=function(){
    /*
    this takes a single step in the animation of the game.
    Also removes dead monsters or delays them accordingly
    */

    if (this.getStage().clients.length > 0)
        Monster.prototype.step.call(this);
}

FollowMonster.prototype.move=function(actor, dx, dy){
    /*
    Determine the players position and move accordingly towards
    it with dx and dy
    */

    if (actor != this) return false;

    if (!(actor instanceof Slayer) && (actor instanceof Player)) {
        actor.kill();
    }

    var followPlayer = null;
    var player = null;
    for(i=0;i<this.getStage().clients.length;i++){
        player = this.getStage().clients[i];
        if (!(player instanceof Slayer)){
            followPlayer= this.getStage().clients[i].player
            break;
        }

    }

    if (followPlayer == null) return;


        dx = this.getDir(followPlayer.x, this.getXPos());
        dy = this.getDir(followPlayer.y, this.getYPos());

        infront = this.getStage().getActor(this.x+dx, this.y+dy);
        if (infront instanceof Player)
            infront.kill();

        Actor.prototype.move.call(this, this, dx, dy);

}
//End FollowMonster Prototype #####################################



///////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////
