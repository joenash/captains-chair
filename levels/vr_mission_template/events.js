// The Sin Bin
let syncClient;
let streams = [];
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
const directionFrames = {
  LEFT: 24,
  RIGHT: 8,
  UP: 16,
  DOWN: 0,
};
let keydownhandler;
let keyuphandler;

module.exports = async function (event, world) {
  console.log(`Captain's chair: ${event.name}`);
  if (event.name === "mapDidLoad") {
    const playerGuid = world.getContext().user.guid;
    const { player } = world.__internals.level;
    const { game } = world.__internals.level;

    let { SyncClient } = require("twilio-sync");

    console.log("Fetching Streams");
    const teamDocuments = await getTeams(playerGuid);
    console.log("Fetching player info");
    const token = await getSyncToken(playerGuid);

    syncClient = new SyncClient(token);
    console.log(syncClient);
    let syncStream = await initializeStream(syncClient, world, playerGuid);

    initializeDocuments(syncClient, teamDocuments, world);

    // Publish moves on an interval, or on a keypress.
    // Streams will publish max 30 times per second, so interval is in
    // theory more predictable and should yield smoother
    // performance.
    //setInterval(() => publishMove(syncStream, player), 50);
    keydownhandler = (event) => {
      const key = event.key.toLowerCase();
      if (keys.includes(key)) {
        lastKey = key;
        publishMove(syncStream, player);
      }
    };
    keyuphandler = (event) => {
      const key = event.key.toLowerCase();
      if (keys.includes(key)) {
        lastKey = "";
        publishMove(syncStream, player);
      }
    };
    window.addEventListener("keydown", keydownhandler);
    window.addEventListener("keyup", keyuphandler);
  }

  if (event.name === "levelWillUnload") {
    console.log("Level unloading", syncClient);

    window.removeEventListener("keydown", keydownhandler);
    window.removeEventListener("keyup", keyuphandler);

    const playerGuid = world.getContext().user.guid;
    const foundStream = streams.findIndex(
      (stream) => stream.uniqueName === playerGuid
    );
    if (foundStream > -1) {
      console.log("Closing player stream");
      const stream = streams[foundStream];
      // TODO socket not initialized here. Also remove a sprite on this message
      const message = await stream.publishMessage({ disconnect: true });
      stream.close();
    }

    if (typeof syncClient !== "undefined") {
      console.log("Shutting down sync client");
      syncClient.shutdown();
    }
  }
};

async function getSyncToken(guid) {
  console.log("Fetching token");
  const res = await fetch(`https://845b-82-217-150-167.ngrok.io/token/${guid}`);
  const data = await res.json();
  const token = data.token;
  return token;
}

async function getTeams(guid) {
  console.log("Fetching Teams");
  const res = await fetch(`https://845b-82-217-150-167.ngrok.io/team/${guid}`);
  const teamIds = await res.json();
  return teamIds;
}

async function initializeDocuments(syncClient, documents, world) {
  const playerGuid = world.getContext().user.guid;
  const username = world.getContext().settings.name;
  const currentLevel = world.getContext().currentLevel.levelName;
  for (teamDocument of documents) {
    const document = await syncClient.document(teamDocument.uniqueName);
    console.log(`Successfully opened document ${teamDocument.uniqueName}`);

    document.on("updated", (event) => {
      console.log(`Document ${document.sid} update`);
      if (event.isLocal) {
        console.log("local update - ignoring");
        return;
      }
      const playerList = event.data.players;
      for (const p of playerList) {
        // TODO check if active here
        if (p.guid !== playerGuid) {
          if (p.level === currentLevel) {
            initializeStream(syncClient, world, p.guid);
          }
        }
      }
    });

    const playerList = document.data.players;
    const playerIndex = playerList.findIndex((p) => p.guid === playerGuid);
    if (playerIndex === -1) {
      playerList.push({
        guid: playerGuid,
        name: username,
        level: currentLevel,
      });
      // TODO add active status here
    } else {
      playerList[playerIndex] = {
        guid: playerGuid,
        name: username,
        level: currentLevel,
      };
      console.log("Player already exists: updating");
    }

    document
      .update({ players: playerList })
      .then((value) => {
        console.log("Document update() successful, new data:", value);
      })
      .catch((error) => console.log("Failed to write to doc", error));

    for (const p of playerList) {
      // TODO check if active here
      if (p.guid !== playerGuid) {
        if (p.level === currentLevel) {
          initializeStream(syncClient, world, p.guid);
        }
      }
    }
  }
}

async function initializeStream(syncClient, world, playerGuid) {
  const yourPlayerGuid = world.getContext().user.guid;
  const { game } = world.__internals.level;
  console.log(`Initializing stream for ${playerGuid}`);
  const streamExists = streams.findIndex(
    (stream) => stream.uniqueName === playerGuid
  );
  if (streamExists > -1 && !streams[streamExists].closed) {
    console.log("Stream already open");
    return;
  }

  console.log("streams", streams);
  let stream = await syncClient.stream(playerGuid);
  // Check if player has previously joined this session
  if (streamExists > -1) {
    streams[streamExists] = stream;
    console.log(
      `Reopened stream for ${playerGuid}: ${stream.uniqueName}, ${stream.sid}`
    );
  } else {
    streams.push(stream);
    console.log(
      `Initialized stream for ${playerGuid}: ${stream.uniqueName}, ${stream.sid}`
    );
  }

  //if (stream.uniqueName !== yourPlayerGuid) {
  if (true) {
    const s = game.add.sprite(0, 0, "playerCharacter", 0);

    // Set up animations

    s.animations.add("moveDown", [5, 6, 7, 6], 8, true);
    s.animations.add("moveUp", [21, 22, 23, 22], 8, true);
    s.animations.add("moveRight", [13, 14, 15, 14], 8, true);
    s.animations.add("moveLeft", [29, 30, 31, 30], 8, true);
    s.frame = directionFrames.DOWN;

    // Adding the sprite to the object group renders it in the correct layer.
    // However, it introduces collision with the player, on the players side.
    // IDEA: Add a sprite to the entitygroup that doesn't have physics,
    //world.entityService.groups.objects.add(s);

    // Strip playerCharacters and players out of the object group to remove
    // collisions.

    const entityGroup = world.entityService
      .getGroup("objects")
      .children.filter(
        (entity) => entity.key !== "player" && entity.key !== "playerCharacter"
      );

    // Configure the sprite's physics body behaviour
    s.anchor.setTo(0, 0);
    game.physics.arcade.enable(s);
    s.body.setSize(18, 12, 6, 20);
    s.body.collideWorldBounds = true;
    s.body.bounce.setTo(0, 0);
    s.visible = false;

    // Set up sprite collisions
    s.update = function () {
      // Collide with the Objects layer
      game.physics.arcade.collide(s, entityGroup);

      world.__internals.TiledService.getLayers(
        (layer) => layer.properties.collision
      ).forEach((collisionLayer) => {
        game.physics.arcade.collide(s, collisionLayer.instance);
      });
    };

    let lastTime = 0;
    let messageCount = 0;

    stream.on("removed", (data) => {
      console.log(`Stream ${stream.uniqueName} removed.`);
      streams.filter((st) => st.uniqueName !== stream.uniqueName);
      s.destroy();
    });

    stream.on("messagePublished", (event) => {
      messageCount += 1;
      //console.log('Received a "messagePublished" event:', event);
      const data = event.message.data;

      if (data.disconnect) {
        console.log(`Closing stream ${stream.uniqueName}`);
        s.destroy();
        stream.close();
        return;
      }
      // Ensure message is newer than last actioned message
      if (data.ts < lastTime) {
        return;
      }
      lastTime = data.ts;
      if (s.visible != true) {
        s.x = event.message.data.x;
        s.y = event.message.data.y;
        s.visible = true;
      }
      if (messageCount > 30) {
        reconcilePosition(s, data);
        messageCount = 0;
      }
      moveSprite(s, data);
    });

    stream.on("removed", (event) => {
      console.log(`Stream ${stream.sid} was removed`);
      streams = streams.filter((s) => s.sid !== stream.sid);
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
    sprite.animations.stop();
    return;
  }

  let animating = false;

  // Terrible hack pending working collision
  // if (collision !== "noCollisions") {
  //   if (sprite.y <= y - 2 || sprite.y >= y + 2) {
  //     sprite.y = y;
  //   }
  //   if (sprite.x <= x - 2 || sprite.x >= x + 2) {
  //     sprite.x = x;
  //   }
  //   sprite.body.velocity.x = 0;
  //   sprite.body.velocity.y = 0;
  //   sprite.x = x;
  //   sprite.y = y;
  //   return;
  // }

  // left and right keyboard movement
  if (keys.left.isDown || keys.a.isDown) {
    sprite.animations.play("moveLeft");
    sprite.directionFrame = directionFrames.LEFT;
    animating = true;
    moveSpeed.x = -120;
  } else if (keys.right.isDown || keys.d.isDown) {
    sprite.animations.play("moveRight");
    sprite.directionFrame = directionFrames.RIGHT;
    animating = true;
    moveSpeed.x = 120;
  } else {
    moveSpeed.x = 0;
  }

  // up and down keyboard movement
  if (keys.up.isDown || keys.w.isDown) {
    if (!animating) {
      sprite.animations.play("moveUp");
      sprite.directionFrame = directionFrames.UP;
    }
    moveSpeed.y = -120;
  } else if (keys.down.isDown || keys.s.isDown) {
    if (!animating) {
      sprite.animations.play("moveDown");
      sprite.directionFrame = directionFrames.DOWN;
    }
    moveSpeed.y = 120;
  } else {
    moveSpeed.y = 0;
  }

  if (Math.abs(moveSpeed.x) > 0 || Math.abs(moveSpeed.y) > 0) {
    sprite.body.velocity.x = moveSpeed.x;
    sprite.body.velocity.y = moveSpeed.y;
  } else {
    sprite.animations.stop();
    sprite.frame = sprite.directionFrame;
  }
}

function reconcilePosition(sprite, data) {
  const { keys, movementDisabled, collision, x, y } = data;

  if (sprite.body.x !== x) {
    sprite.x = x;
  }

  if (sprite.body.y !== y) {
    sprite.y = y;
  }
}

async function publishMove(stream, player) {
  if (stream.closed) {
    console.log("stream closed");
    return;
  }

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
      // console.log(
      //   "Stream publishMessage() successful, message SID:",
      //   message.sid
      // );
    })
    .catch((error) => {
      console.error("Stream publishMessage() failed", error);
    });
}
