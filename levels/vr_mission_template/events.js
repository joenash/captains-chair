module.exports = async function (event, world) {
  console.log(`Captains chair: ${event.name}`);

  const playerGuid = world.getContext().user.guid;
  const { player } = world.__internals.level;
  const keys = [
    "w",
    "arrowup",
    "a",
    "arrowleft",
    "s",
    "arrowright",
    "d",
    "arrowdown",
  ];
  const { game } = world.__internals.level;
  console.log("Player", player);
  const username = world.getContext().settings.name;

  if (event.name === "mapDidLoad") {
    let { SyncClient } = require("twilio-sync");

    console.log("Fetching Streams");
    const teamDocuments = await getTeams(playerGuid);
    console.log("Fetching player info");
    const token = await getSyncToken(playerGuid);

    let syncClient = new SyncClient(token);
    let syncStream = await initializeStream(syncClient, world, playerGuid);

    console.log(syncStream);

    initializeDocuments(syncClient, teamDocuments, world);

    window.addEventListener("keydown", (event) => {
      const key = event.key.toLowerCase();
      if (keys.includes(key)) {
        publishMove(syncStream, player, key);
      }
    });
    window.addEventListener("keyup", (event) => {
      const key = event.key.toLowerCase();
      if (keys.includes(key)) {
        publishMove(syncStream, player, key);
      }
    });
  }

  console.log(event);
  console.log(world.getContext());
};

async function getSyncToken(guid) {
  console.log("Fetching token");
  const res = await fetch(`https://845b-82-217-150-167.ngrok.io/token/${guid}`);
  const data = await res.json();
  const token = data.token;
  console.log(token);
  return token;
}

async function getTeams(guid) {
  console.log("Fetching Teams");
  const res = await fetch(`https://845b-82-217-150-167.ngrok.io/team/${guid}`);
  const teamIds = await res.json();
  console.log(teamIds);
  return teamIds;
}

async function initializeDocuments(syncClient, documents, world) {
  const playerGuid = world.getContext().user.guid;
  const username = world.getContext().settings.name;
  for (teamDocument of documents) {
    const document = await syncClient.document(teamDocument.uniqueName);
    console.log("Successfully opened document", document);

    document.on("updated", (event) => {
      console.log('Received an "updated" event: ', event);
    });

    const playerList = document.data.players;
    const playerIndex = playerList.findIndex((p) => p.guid === playerGuid);
    if (playerIndex === -1) {
      console.log("player list:", playerList);
      playerList.push({ guid: playerGuid, name: username });
      console.log("player list updated:", playerList);
    } else {
      console.log("Player already exists");
    }

    document
      .update({ players: playerList })
      .then((value) => {
        console.log("Document update() successful, new data:", value);
      })
      .catch((error) => console.log("Failed to write to doc", error));

    for (const p of playerList) {
      if (p.guid !== playerGuid) {
        initializeStream(syncClient, world, p.guid);
      }
    }
  }
}

async function initializeStream(syncClient, world, playerGuid) {
  const yourPlayerGuid = world.getContext().user.guid;
  const yourPlayer = world.__internals.level.player;
  const { game } = world.__internals.level;
  console.log("Init Stream game:", game);
  let stream = await syncClient.stream(playerGuid);
  console.log("Initialized stream: ", stream.uniqueName);
  // if (stream.uniqueName !== yourPlayerGuid) {
  if (true) {
    const s = game.add.sprite(0, 0, "playerCharacter", 0);
    s.anchor.setTo(0, 0);
    game.physics.arcade.enable(s);
    console.log(s);
    s.body.collideWorldBounds = true;
    s.body.bounce.setTo(0, 0);
    s.update = function () {
      game.physics.arcade.collide(
        s,
        yourPlayer.level.entityService.getGroup("objects")
      );
      world.__internals.TiledService.getLayers(
        (layer) => layer.properties.collision
      ).forEach((collisionLayer) => {
        game.physics.arcade.collide(s, collisionLayer.instance);
      });
    };

    // This doesn't work as its outside update loop
    // game.physics.arcade.collide(
    //   s,
    //   player.level.entityService.getGroup("objects")
    // );

    s.visible = false;
    console.log("sprite", s);
    let lastTime = 0;
    stream.on("messagePublished", (event) => {
      console.log('Received a "messagePublished" event:', event);
      // const { x, y } = event.message.data;
      // s.x = x;
      // s.y = y;
      const data = event.message.data;
      if (data.ts < lastTime) {
        return;
      }
      lastTime = data.ts;
      if (s.visible != true) {
        s.x = event.message.data.x;
        s.y = event.message.data.y;
        s.visible = true;
      }
      moveSprite(s, data);
    });
  }

  return stream;
}

function moveSprite(sprite, data) {
  const { keys, movementDisabled, collision, x, y } = data;

  let moveSpeed = {};

  sprite.body.velocity.x = 0;
  sprite.body.velocity.y = 0;

  if (movementDisabled) {
    return;
  }

  // Terrible hack pending working collision
  // if (collision !== "noCollisions") {
  //   sprite.body.velocity.x = 0;
  //   sprite.body.velocity.y = 0;
  //   sprite.x = x;
  //   sprite.y = y;
  //   return;
  // }

  // left and right keyboard movement
  if (keys.left.isDown || keys.a.isDown) {
    // sprite.animations.play("moveLeft");
    // sprite.directionFrame = directionFrames.LEFT;
    // animating = true;
    moveSpeed.x = -120;
  } else if (keys.right.isDown || keys.d.isDown) {
    // sprite.animations.play("moveRight");
    // sprite.directionFrame = directionFrames.RIGHT;
    // animating = true;
    moveSpeed.x = 120;
  } else {
    moveSpeed.x = 0;
  }

  // up and down keyboard movement
  if (keys.up.isDown || keys.w.isDown) {
    // if (!animating) {
    //   sprite.animations.play("moveUp");
    //   sprite.directionFrame = directionFrames.UP;
    // }
    moveSpeed.y = -120;
  } else if (keys.down.isDown || keys.s.isDown) {
    // if (!animating) {
    //   sprite.animations.play("moveDown");
    //   sprite.directionFrame = directionFrames.DOWN;
    // }
    moveSpeed.y = 120;
  } else {
    moveSpeed.y = 0;
  }

  if (Math.abs(moveSpeed.x) > 0 || Math.abs(moveSpeed.y) > 0) {
    sprite.body.velocity.x = moveSpeed.x;
    sprite.body.velocity.y = moveSpeed.y;
    //this.footStepSfx.tryStep();
  } else {
    // this.sprite.animations.stop();
    // this.sprite.frame = this.sprite.directionFrame;
  }
}

function reconcilePosition(sprite, x, y) {}

async function publishMove(stream, player, key) {
  const keys = {
    up: { isDown: player.keys.up.isDown },
    w: { isDown: player.keys.w.isDown },
    left: { isDown: player.keys.left.isDown },
    a: { isDown: player.keys.a.isDown },
    right: { isDown: player.keys.right.isDown },
    d: { isDown: player.keys.d.isDown },
    down: { isDown: player.keys.down.isDown },
    s: { isDown: player.keys.s.isDown },
    action: { isDown: player.keys.action.isDown },
  };

  stream
    .publishMessage({
      movementDisabled: player.movementDisabled,
      x: player.sprite.x,
      y: player.sprite.y,
      keys,
      collision: player.collidingState.currentState,
      ts: Date.now(),
    })
    .then((message) => {
      console.log(
        "Stream publishMessage() successful, message SID:",
        message.sid
      );
    })
    .catch((error) => {
      console.error("Stream publishMessage() failed", error);
    });
}
