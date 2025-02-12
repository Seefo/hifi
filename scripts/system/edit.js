//  edit.js
//
//  Created by Brad Hefta-Gaub on 10/2/14.
//  Persist toolbar by HRS 6/11/15.
//  Copyright 2014 High Fidelity, Inc.
//
//  This script allows you to edit entities with a new UI/UX for mouse and trackpad based editing
//
//  Distributed under the Apache License, Version 2.0.
//  See the accompanying file LICENSE or http://www.apache.org/licenses/LICENSE-2.0.html
//

/* global Script, SelectionDisplay, LightOverlayManager, CameraManager, Grid, GridTool, EntityListTool, Vec3, SelectionManager, Overlays, OverlayWebWindow, UserActivityLogger,
   Settings, Entities, Tablet, Toolbars, Messages, Menu, Camera, progressDialog, tooltip, MyAvatar, Quat, Controller, Clipboard, HMD, UndoStack, ParticleExplorerTool */

(function() { // BEGIN LOCAL_SCOPE

"use strict";

var HIFI_PUBLIC_BUCKET = "http://s3.amazonaws.com/hifi-public/";
var EDIT_TOGGLE_BUTTON = "com.highfidelity.interface.system.editButton";
var SYSTEM_TOOLBAR = "com.highfidelity.interface.toolbar.system";
var EDIT_TOOLBAR = "com.highfidelity.interface.toolbar.edit";

Script.include([
    "libraries/stringHelpers.js",
    "libraries/dataViewHelpers.js",
    "libraries/progressDialog.js",
    "libraries/entitySelectionTool.js",
    "libraries/ToolTip.js",
    "libraries/entityCameraTool.js",
    "libraries/gridTool.js",
    "libraries/entityList.js",
    "particle_explorer/particleExplorerTool.js",
    "libraries/entityIconOverlayManager.js"
]);

var selectionDisplay = SelectionDisplay;
var selectionManager = SelectionManager;

var PARTICLE_SYSTEM_URL = Script.resolvePath("assets/images/icon-particles.svg");
var POINT_LIGHT_URL = Script.resolvePath("assets/images/icon-point-light.svg");
var SPOT_LIGHT_URL = Script.resolvePath("assets/images/icon-spot-light.svg");
entityIconOverlayManager = new EntityIconOverlayManager(['Light', 'ParticleEffect'], function(entityID) {
    var properties = Entities.getEntityProperties(entityID, ['type', 'isSpotlight']);
    if (properties.type === 'Light') {
        return {
            url: properties.isSpotlight ? SPOT_LIGHT_URL : POINT_LIGHT_URL,
        };
    } else {
        return {
            url: PARTICLE_SYSTEM_URL,
        };
    }
});

var cameraManager = new CameraManager();

var grid = new Grid();
var gridTool = new GridTool({
    horizontalGrid: grid
});
gridTool.setVisible(false);

var entityListTool = new EntityListTool();

selectionManager.addEventListener(function () {
    selectionDisplay.updateHandles();
    entityIconOverlayManager.updatePositions();

    // Update particle explorer
    var needToDestroyParticleExplorer = false;
    if (selectionManager.selections.length === 1) {
        var selectedEntityID = selectionManager.selections[0];
        if (selectedEntityID === selectedParticleEntityID) {
            return;
        }
        var type = Entities.getEntityProperties(selectedEntityID, "type").type;
        if (type === "ParticleEffect") {
            selectParticleEntity(selectedEntityID);
        } else {
            needToDestroyParticleExplorer = true;
        }
    } else {
        needToDestroyParticleExplorer = true;
    }

    if (needToDestroyParticleExplorer && selectedParticleEntityID !== null) {
        selectedParticleEntityID = null;
        particleExplorerTool.destroyWebView();
    }
});

var KEY_P = 80; //Key code for letter p used for Parenting hotkey.
var DEGREES_TO_RADIANS = Math.PI / 180.0;
var RADIANS_TO_DEGREES = 180.0 / Math.PI;

var MIN_ANGULAR_SIZE = 2;
var MAX_ANGULAR_SIZE = 45;
var allowLargeModels = true;
var allowSmallModels = true;

var DEFAULT_DIMENSION = 0.20;

var DEFAULT_DIMENSIONS = {
    x: DEFAULT_DIMENSION,
    y: DEFAULT_DIMENSION,
    z: DEFAULT_DIMENSION
};

var DEFAULT_LIGHT_DIMENSIONS = Vec3.multiply(20, DEFAULT_DIMENSIONS);

var MENU_AUTO_FOCUS_ON_SELECT = "Auto Focus on Select";
var MENU_EASE_ON_FOCUS = "Ease Orientation on Focus";
var MENU_SHOW_LIGHTS_AND_PARTICLES_IN_EDIT_MODE = "Show Lights and Particle Systems in Edit Mode";
var MENU_SHOW_ZONES_IN_EDIT_MODE = "Show Zones in Edit Mode";

var SETTING_AUTO_FOCUS_ON_SELECT = "autoFocusOnSelect";
var SETTING_EASE_ON_FOCUS = "cameraEaseOnFocus";
var SETTING_SHOW_LIGHTS_AND_PARTICLES_IN_EDIT_MODE = "showLightsAndParticlesInEditMode";
var SETTING_SHOW_ZONES_IN_EDIT_MODE = "showZonesInEditMode";

var CREATE_ENABLED_ICON = "icons/tablet-icons/edit-i.svg";
var CREATE_DISABLED_ICON = "icons/tablet-icons/edit-disabled.svg";

// marketplace info, etc.  not quite ready yet.
var SHOULD_SHOW_PROPERTY_MENU = false;
var INSUFFICIENT_PERMISSIONS_ERROR_MSG = "You do not have the necessary permissions to edit on this domain.";
var INSUFFICIENT_PERMISSIONS_IMPORT_ERROR_MSG = "You do not have the necessary permissions to place items on this domain.";

var isActive = false;
var createButton = null;

var IMPORTING_SVO_OVERLAY_WIDTH = 144;
var IMPORTING_SVO_OVERLAY_HEIGHT = 30;
var IMPORTING_SVO_OVERLAY_MARGIN = 5;
var IMPORTING_SVO_OVERLAY_LEFT_MARGIN = 34;
var importingSVOImageOverlay = Overlays.addOverlay("image", {
    imageURL: Script.resolvePath("assets") + "/images/hourglass.svg",
    width: 20,
    height: 20,
    alpha: 1.0,
    x: Window.innerWidth - IMPORTING_SVO_OVERLAY_WIDTH,
    y: Window.innerHeight - IMPORTING_SVO_OVERLAY_HEIGHT,
    visible: false
});
var importingSVOTextOverlay = Overlays.addOverlay("text", {
    font: {
        size: 14
    },
    text: "Importing SVO...",
    leftMargin: IMPORTING_SVO_OVERLAY_LEFT_MARGIN,
    x: Window.innerWidth - IMPORTING_SVO_OVERLAY_WIDTH - IMPORTING_SVO_OVERLAY_MARGIN,
    y: Window.innerHeight - IMPORTING_SVO_OVERLAY_HEIGHT - IMPORTING_SVO_OVERLAY_MARGIN,
    width: IMPORTING_SVO_OVERLAY_WIDTH,
    height: IMPORTING_SVO_OVERLAY_HEIGHT,
    backgroundColor: {
        red: 80,
        green: 80,
        blue: 80
    },
    backgroundAlpha: 0.7,
    visible: false
});

var MARKETPLACE_URL = "https://metaverse.highfidelity.com/marketplace";
var marketplaceWindow = new OverlayWebWindow({
    title: 'Marketplace',
    source: "about:blank",
    width: 900,
    height: 700,
    visible: false
});

function showMarketplace(marketplaceID) {
    var url = MARKETPLACE_URL;
    if (marketplaceID) {
        url = url + "/items/" + marketplaceID;
    }
    marketplaceWindow.setURL(url);
    marketplaceWindow.setVisible(true);
    marketplaceWindow.raise();

    UserActivityLogger.logAction("opened_marketplace");
}

function hideMarketplace() {
    marketplaceWindow.setVisible(false);
    marketplaceWindow.setURL("about:blank");
}

// function toggleMarketplace() {
//     if (marketplaceWindow.visible) {
//         hideMarketplace();
//     } else {
//         showMarketplace();
//     }
// }

function adjustPositionPerBoundingBox(position, direction, registration, dimensions, orientation) {
    // Adjust the position such that the bounding box (registration, dimenions, and orientation) lies behind the original
    // position in the given direction.
    var CORNERS = [
        { x: 0, y: 0, z: 0 },
        { x: 0, y: 0, z: 1 },
        { x: 0, y: 1, z: 0 },
        { x: 0, y: 1, z: 1 },
        { x: 1, y: 0, z: 0 },
        { x: 1, y: 0, z: 1 },
        { x: 1, y: 1, z: 0 },
        { x: 1, y: 1, z: 1 },
    ];

    // Go through all corners and find least (most negative) distance in front of position.
    var distance = 0;
    for (var i = 0, length = CORNERS.length; i < length; i++) {
        var cornerVector =
            Vec3.multiplyQbyV(orientation, Vec3.multiplyVbyV(Vec3.subtract(CORNERS[i], registration), dimensions));
        var cornerDistance = Vec3.dot(cornerVector, direction);
        distance = Math.min(cornerDistance, distance);
    }
    position = Vec3.sum(Vec3.multiply(distance, direction), position);
    return position;
}

var TOOLS_PATH = Script.resolvePath("assets/images/tools/");
var GRABBABLE_ENTITIES_MENU_CATEGORY = "Edit";
var GRABBABLE_ENTITIES_MENU_ITEM = "Create Entities As Grabbable";

var toolBar = (function () {
    var EDIT_SETTING = "io.highfidelity.isEditting"; // for communication with other scripts
    var that = {},
        toolBar,
        activeButton = null,
        systemToolbar = null,
        tablet = null;

    function createNewEntity(properties) {
        var dimensions = properties.dimensions ? properties.dimensions : DEFAULT_DIMENSIONS;
        var position = getPositionToCreateEntity();
        var entityID = null;
        if (position !== null && position !== undefined) {
            var direction;
            if (Camera.mode === "entity" || Camera.mode === "independent") {
                direction = Camera.orientation;
            } else {
                direction = MyAvatar.orientation;
            }
            direction = Vec3.multiplyQbyV(direction, Vec3.UNIT_Z);

            var PRE_ADJUST_ENTITY_TYPES = ["Box", "Sphere", "Shape", "Text", "Web"];
            if (PRE_ADJUST_ENTITY_TYPES.indexOf(properties.type) !== -1) {
                // Adjust position of entity per bounding box prior to creating it.
                var registration = properties.registration;
                if (registration === undefined) {
                    var DEFAULT_REGISTRATION = { x: 0.5, y: 0.5, z: 0.5 };
                    registration = DEFAULT_REGISTRATION;
                }

                var orientation = properties.orientation;
                if (orientation === undefined) {
                    var DEFAULT_ORIENTATION = Quat.fromPitchYawRollDegrees(0, 0, 0);
                    orientation = DEFAULT_ORIENTATION;
                }

                position = adjustPositionPerBoundingBox(position, direction, registration, dimensions, orientation);
            }

            position = grid.snapToSurface(grid.snapToGrid(position, false, dimensions), dimensions);
            properties.position = position;
            if (Menu.isOptionChecked(GRABBABLE_ENTITIES_MENU_ITEM)) {
                properties.userData = JSON.stringify({ grabbableKey: { grabbable: true } });
            }
            entityID = Entities.addEntity(properties);

            if (properties.type === "ParticleEffect") {
                selectParticleEntity(entityID);
            }

            var POST_ADJUST_ENTITY_TYPES = ["Model"];
            if (POST_ADJUST_ENTITY_TYPES.indexOf(properties.type) !== -1) {
                // Adjust position of entity per bounding box after it has been created and auto-resized.
                var initialDimensions = Entities.getEntityProperties(entityID, ["dimensions"]).dimensions;
                var DIMENSIONS_CHECK_INTERVAL = 200;
                var MAX_DIMENSIONS_CHECKS = 10;
                var dimensionsCheckCount = 0;
                var dimensionsCheckFunction = function () {
                    dimensionsCheckCount++;
                    var properties = Entities.getEntityProperties(entityID, ["dimensions", "registrationPoint", "rotation"]);
                    if (!Vec3.equal(properties.dimensions, initialDimensions)) {
                        position = adjustPositionPerBoundingBox(position, direction, properties.registrationPoint,
                            properties.dimensions, properties.rotation);
                        position = grid.snapToSurface(grid.snapToGrid(position, false, properties.dimensions),
                            properties.dimensions);
                        Entities.editEntity(entityID, {
                            position: position
                        });
                        selectionManager._update();
                    } else if (dimensionsCheckCount < MAX_DIMENSIONS_CHECKS) {
                        Script.setTimeout(dimensionsCheckFunction, DIMENSIONS_CHECK_INTERVAL);
                    }
                };
                Script.setTimeout(dimensionsCheckFunction, DIMENSIONS_CHECK_INTERVAL);
            }
        } else {
            Window.notifyEditError("Can't create " + properties.type + ": " +
                                   properties.type + " would be out of bounds.");
        }

        selectionManager.clearSelections();
        entityListTool.sendUpdate();
        selectionManager.setSelections([entityID]);

        return entityID;
    }

    function cleanup() {
        that.setActive(false);
        if (tablet) {
            tablet.removeButton(activeButton);
        }
        if (systemToolbar) {
            systemToolbar.removeButton(EDIT_TOGGLE_BUTTON);
        }
        Menu.removeMenuItem(GRABBABLE_ENTITIES_MENU_CATEGORY, GRABBABLE_ENTITIES_MENU_ITEM);
    }

    var buttonHandlers = {}; // only used to tablet mode

    function addButton(name, image, handler) {
        buttonHandlers[name] = handler;
    }

    var SHAPE_TYPE_NONE = 0;
    var SHAPE_TYPE_SIMPLE_HULL = 1;
    var SHAPE_TYPE_SIMPLE_COMPOUND = 2;
    var SHAPE_TYPE_STATIC_MESH = 3;
    var SHAPE_TYPE_BOX = 4;
    var SHAPE_TYPE_SPHERE = 5;
    var DYNAMIC_DEFAULT = false;

    function handleNewModelDialogResult(result) {
        if (result) {
            var url = result.textInput;
            var shapeType;
            switch (result.comboBox) {
            case SHAPE_TYPE_SIMPLE_HULL:
                shapeType = "simple-hull";
                break;
            case SHAPE_TYPE_SIMPLE_COMPOUND:
                shapeType = "simple-compound";
                break;
            case SHAPE_TYPE_STATIC_MESH:
                shapeType = "static-mesh";
                break;
            case SHAPE_TYPE_BOX:
                shapeType = "box";
                break;
            case SHAPE_TYPE_SPHERE:
                shapeType = "sphere";
                break;
            default:
                shapeType = "none";
            }

            var dynamic = result.checkBox !== null ? result.checkBox : DYNAMIC_DEFAULT;
            if (shapeType === "static-mesh" && dynamic) {
                // The prompt should prevent this case
                print("Error: model cannot be both static mesh and dynamic.  This should never happen.");
            } else if (url) {
                createNewEntity({
                    type: "Model",
                    modelURL: url,
                    shapeType: shapeType,
                    dynamic: dynamic,
                    gravity: dynamic ? { x: 0, y: -10, z: 0 } : { x: 0, y: 0, z: 0 }
                });
            }
        }
    }

    function fromQml(message) { // messages are {method, params}, like json-rpc. See also sendToQml.
        var tablet = Tablet.getTablet("com.highfidelity.interface.tablet.system");
        tablet.popFromStack();
        switch (message.method) {
        case "newModelDialogAdd":
            handleNewModelDialogResult(message.params);
            break;
        case "newEntityButtonClicked":
            buttonHandlers[message.params.buttonName]();
            break;
        }
    }

    function initialize() {
        Script.scriptEnding.connect(cleanup);
        Window.domainChanged.connect(function () {
            that.setActive(false);
            that.clearEntityList();
        });

        Entities.canAdjustLocksChanged.connect(function (canAdjustLocks) {
            if (isActive && !canAdjustLocks) {
                that.setActive(false);
            }
        });

        var hasRezPermissions = (Entities.canRez() || Entities.canRezTmp());
        var createButtonIconRsrc = (hasRezPermissions ? CREATE_ENABLED_ICON : CREATE_DISABLED_ICON);
        tablet = Tablet.getTablet("com.highfidelity.interface.tablet.system");
        activeButton = tablet.addButton({
            captionColorOverride: hasRezPermissions ? "" : "#888888",
            icon: createButtonIconRsrc,
            activeIcon: "icons/tablet-icons/edit-a.svg",
            text: "CREATE",
            sortOrder: 10
        });
        createButton = activeButton;
        tablet.screenChanged.connect(function (type, url) {
            if (isActive && (type !== "QML" || url !== "Edit.qml")) {
                that.setActive(false)
            }
        });
        tablet.fromQml.connect(fromQml);

        createButton.clicked.connect(function() {
            if ( ! (Entities.canRez() || Entities.canRezTmp()) ) {
                Window.notifyEditError(INSUFFICIENT_PERMISSIONS_ERROR_MSG);
                return;
            }

            that.toggle();
        });

        addButton("importEntitiesButton", "assets-01.svg", function() {
            var importURL = null;
            var fullPath = Window.browse("Select Model to Import", "", "*.json");
            if (fullPath) {
                importURL = "file:///" + fullPath;
            }
            if (importURL) {
                if (!isActive && (Entities.canRez() && Entities.canRezTmp())) {
                    toolBar.toggle();
                }
                importSVO(importURL);
            }
        });

        addButton("openAssetBrowserButton", "assets-01.svg", function() {
            Window.showAssetServer();
        });

        addButton("newModelButton", "model-01.svg", function () {

            var SHAPE_TYPES = [];
            SHAPE_TYPES[SHAPE_TYPE_NONE] = "No Collision";
            SHAPE_TYPES[SHAPE_TYPE_SIMPLE_HULL] = "Basic - Whole model";
            SHAPE_TYPES[SHAPE_TYPE_SIMPLE_COMPOUND] = "Good - Sub-meshes";
            SHAPE_TYPES[SHAPE_TYPE_STATIC_MESH] = "Exact - All polygons";
            SHAPE_TYPES[SHAPE_TYPE_BOX] = "Box";
            SHAPE_TYPES[SHAPE_TYPE_SPHERE] = "Sphere";
            var SHAPE_TYPE_DEFAULT = SHAPE_TYPE_STATIC_MESH;

            // tablet version of new-model dialog
            var tablet = Tablet.getTablet("com.highfidelity.interface.tablet.system");
            tablet.pushOntoStack("NewModelDialog.qml");
        });

        addButton("newCubeButton", "cube-01.svg", function () {
            createNewEntity({
                type: "Box",
                dimensions: DEFAULT_DIMENSIONS,
                color: {
                    red: 255,
                    green: 0,
                    blue: 0
                }
            });
        });

        addButton("newSphereButton", "sphere-01.svg", function () {
            createNewEntity({
                type: "Sphere",
                dimensions: DEFAULT_DIMENSIONS,
                color: {
                    red: 255,
                    green: 0,
                    blue: 0
                }
            });
        });

        addButton("newLightButton", "light-01.svg", function () {
            createNewEntity({
                type: "Light",
                dimensions: DEFAULT_LIGHT_DIMENSIONS,
                isSpotlight: false,
                color: {
                    red: 150,
                    green: 150,
                    blue: 150
                },

                constantAttenuation: 1,
                linearAttenuation: 0,
                quadraticAttenuation: 0,
                exponent: 0,
                cutoff: 180 // in degrees
            });
        });

        addButton("newTextButton", "text-01.svg", function () {
            createNewEntity({
                type: "Text",
                dimensions: {
                    x: 0.65,
                    y: 0.3,
                    z: 0.01
                },
                backgroundColor: {
                    red: 64,
                    green: 64,
                    blue: 64
                },
                textColor: {
                    red: 255,
                    green: 255,
                    blue: 255
                },
                text: "some text",
                lineHeight: 0.06
            });
        });

        addButton("newWebButton", "web-01.svg", function () {
            createNewEntity({
                type: "Web",
                dimensions: {
                    x: 1.6,
                    y: 0.9,
                    z: 0.01
                },
                sourceUrl: "https://highfidelity.com/"
            });
        });

        addButton("newZoneButton", "zone-01.svg", function () {
            createNewEntity({
                type: "Zone",
                dimensions: {
                    x: 10,
                    y: 10,
                    z: 10
                }
            });
        });

        addButton("newParticleButton", "particle-01.svg", function () {
            createNewEntity({
                type: "ParticleEffect",
                isEmitting: true,
                emitterShouldTrail: true,
                color: {
                    red: 200,
                    green: 200,
                    blue: 200
                },
                colorSpread: {
                    red: 0,
                    green: 0,
                    blue: 0
                },
                colorStart: {
                    red: 200,
                    green: 200,
                    blue: 200
                },
                colorFinish: {
                    red: 0,
                    green: 0,
                    blue: 0
                },
                emitAcceleration: {
                    x: -0.5,
                    y: 2.5,
                    z: -0.5
                },
                accelerationSpread: {
                    x: 0.5,
                    y: 1,
                    z: 0.5
                },
                emitRate: 5.5,
                emitSpeed: 0,
                speedSpread: 0,
                lifespan: 1.5,
                maxParticles: 10,
                particleRadius: 0.25,
                radiusStart: 0,
                radiusFinish: 0.1,
                radiusSpread: 0,
                alpha: 0,
                alphaStart: 1,
                alphaFinish: 0,
                polarStart: 0,
                polarFinish: 0,
                textures: "https://content.highfidelity.com/DomainContent/production/Particles/wispy-smoke.png"
            });
        });

        that.setActive(false);
    }

    that.clearEntityList = function () {
        entityListTool.clearEntityList();
    };

    that.toggle = function () {
        that.setActive(!isActive);
        if (!isActive) {
            tablet.gotoHomeScreen();
        }
    };

    that.setActive = function (active) {
        ContextOverlay.enabled = !active;
        Settings.setValue(EDIT_SETTING, active);
        if (active) {
            Controller.captureEntityClickEvents();
        } else {
            Controller.releaseEntityClickEvents();
        }
        if (active === isActive) {
            return;
        }
        if (active && !Entities.canRez() && !Entities.canRezTmp()) {
            Window.notifyEditError(INSUFFICIENT_PERMISSIONS_ERROR_MSG);
            return;
        }
        Messages.sendLocalMessage("edit-events", JSON.stringify({
            enabled: active
        }));
        isActive = active;
        activeButton.editProperties({isActive: isActive});

        var tablet = Tablet.getTablet("com.highfidelity.interface.tablet.system");

        if (!isActive) {
            entityListTool.setVisible(false);
            gridTool.setVisible(false);
            grid.setEnabled(false);
            propertiesTool.setVisible(false);
            selectionManager.clearSelections();
            cameraManager.disable();
            selectionDisplay.triggerMapping.disable();
            tablet.landscape = false;
        } else {
            tablet.loadQMLSource("Edit.qml");
            UserActivityLogger.enabledEdit();
            entityListTool.setVisible(true);
            gridTool.setVisible(true);
            grid.setEnabled(true);
            propertiesTool.setVisible(true);
            selectionDisplay.triggerMapping.enable();
            print("starting tablet in landscape mode");
            tablet.landscape = true;
            entityIconOverlayManager.setIconsSelectable(null,false);
            // Not sure what the following was meant to accomplish, but it currently causes
            // everybody else to think that Interface has lost focus overall. fogbugzid:558
            // Window.setFocus();
        }
        entityIconOverlayManager.setVisible(isActive && Menu.isOptionChecked(MENU_SHOW_LIGHTS_AND_PARTICLES_IN_EDIT_MODE));
        Entities.setDrawZoneBoundaries(isActive && Menu.isOptionChecked(MENU_SHOW_ZONES_IN_EDIT_MODE));
    };

    initialize();
    return that;
})();


function isLocked(properties) {
    // special case to lock the ground plane model in hq.
    if (location.hostname === "hq.highfidelity.io" &&
        properties.modelURL === HIFI_PUBLIC_BUCKET + "ozan/Terrain_Reduce_forAlpha.fbx") {
        return true;
    }
    return false;
}


var selectedEntityID;
var orientation;
var intersection;


function rayPlaneIntersection(pickRay, point, normal) { //
    //
    //  This version of the test returns the intersection of a line with a plane
    //
    var collides = Vec3.dot(pickRay.direction, normal);

    var d = -Vec3.dot(point, normal);
    var t = -(Vec3.dot(pickRay.origin, normal) + d) / collides;

    return Vec3.sum(pickRay.origin, Vec3.multiply(pickRay.direction, t));
}

function rayPlaneIntersection2(pickRay, point, normal) {
    //
    //  This version of the test returns false if the ray is directed away from the plane
    //
    var collides = Vec3.dot(pickRay.direction, normal);
    var d = -Vec3.dot(point, normal);
    var t = -(Vec3.dot(pickRay.origin, normal) + d) / collides;
    if (t < 0.0) {
        return false;
    } else {
        return Vec3.sum(pickRay.origin, Vec3.multiply(pickRay.direction, t));
    }
}

function findClickedEntity(event) {
    var pickZones = event.isControl;

    if (pickZones) {
        Entities.setZonesArePickable(true);
    }

    var pickRay = Camera.computePickRay(event.x, event.y);

    var overlayResult = Overlays.findRayIntersection(pickRay, true, [HMD.tabletID, HMD.tabletScreenID, HMD.homeButtonID]);
    if (overlayResult.intersects) {
        return null;
    }

    var entityResult = Entities.findRayIntersection(pickRay, true); // want precision picking
    var iconResult = entityIconOverlayManager.findRayIntersection(pickRay);
    iconResult.accurate = true;

    if (pickZones) {
        Entities.setZonesArePickable(false);
    }

    var result;

    if (iconResult.intersects) {
        result = iconResult;
    } else if (entityResult.intersects) {
        result = entityResult;
    } else {
        return null;
    }

    if (!result.accurate) {
        return null;
    }

    var foundEntity = result.entityID;
    return {
        pickRay: pickRay,
        entityID: foundEntity,
        intersection: result.intersection
    };
}

// Handles selections on overlays while in edit mode by querying entities from
// entityIconOverlayManager.
function handleOverlaySelectionToolUpdates(channel, message, sender) {
    if (sender !== MyAvatar.sessionUUID || channel !== 'entityToolUpdates')
        return;

    var data = JSON.parse(message);

    if (data.method === "selectOverlay") {
        print("setting selection to overlay " + data.overlayID);
        var entity = entityIconOverlayManager.findEntity(data.overlayID);

        if (entity !== null) {
            selectionManager.setSelections([entity]);
        }
    }
}

// Handles any edit mode updates required when domains have switched
function handleDomainChange() {
    if ( (createButton === null) || (createButton === undefined) ){
        //--EARLY EXIT--( nothing to safely update )
        return;
    }

    var hasRezPermissions = (Entities.canRez() || Entities.canRezTmp());
    createButton.editProperties({
        icon: (hasRezPermissions ? CREATE_ENABLED_ICON : CREATE_DISABLED_ICON),
        captionColorOverride: (hasRezPermissions ? "" : "#888888"),
    });
}

function handleMessagesReceived(channel, message, sender) {
    switch( channel ){
        case 'entityToolUpdates': {
            handleOverlaySelectionToolUpdates( channel, message, sender );
            break;
        }
        case 'Toolbar-DomainChanged': {
            handleDomainChange();
            break;
        }
        default: {
            return;
        }
    }
}

Messages.subscribe('Toolbar-DomainChanged');
Messages.subscribe("entityToolUpdates");
Messages.messageReceived.connect(handleMessagesReceived);

var mouseHasMovedSincePress = false;
var mousePressStartTime = 0;
var mousePressStartPosition = {
    x: 0,
    y: 0
};
var mouseDown = false;

function mousePressEvent(event) {
    mouseDown = true;
    mousePressStartPosition = {
        x: event.x,
        y: event.y
    };
    mousePressStartTime = Date.now();
    mouseHasMovedSincePress = false;
    mouseCapturedByTool = false;

    if (propertyMenu.mousePressEvent(event) || progressDialog.mousePressEvent(event)) {
        mouseCapturedByTool = true;
        return;
    }
    if (isActive) {
        if (cameraManager.mousePressEvent(event) || selectionDisplay.mousePressEvent(event)) {
            // Event handled; do nothing.
            return;
        }
    }
}

var mouseCapturedByTool = false;
var lastMousePosition = null;
var CLICK_TIME_THRESHOLD = 500 * 1000; // 500 ms
var CLICK_MOVE_DISTANCE_THRESHOLD = 20;
var IDLE_MOUSE_TIMEOUT = 200;

var lastMouseMoveEvent = null;

function mouseMoveEventBuffered(event) {
    lastMouseMoveEvent = event;
}

function mouseMove(event) {
    if (mouseDown && !mouseHasMovedSincePress) {
        var timeSincePressMicro = Date.now() - mousePressStartTime;

        var dX = mousePressStartPosition.x - event.x;
        var dY = mousePressStartPosition.y - event.y;
        var sqDist = (dX * dX) + (dY * dY);

        // If less than CLICK_TIME_THRESHOLD has passed since the mouse click AND the mouse has moved
        // less than CLICK_MOVE_DISTANCE_THRESHOLD distance, then don't register this as a mouse move
        // yet. The goal is to provide mouse clicks that are more lenient to small movements.
        if (timeSincePressMicro < CLICK_TIME_THRESHOLD && sqDist < CLICK_MOVE_DISTANCE_THRESHOLD) {
            return;
        }
        mouseHasMovedSincePress = true;
    }

    if (!isActive) {
        return;
    }

    // allow the selectionDisplay and cameraManager to handle the event first, if it doesn't handle it, then do our own thing
    if (selectionDisplay.mouseMoveEvent(event) || propertyMenu.mouseMoveEvent(event) || cameraManager.mouseMoveEvent(event)) {
        return;
    }

    lastMousePosition = {
        x: event.x,
        y: event.y
    };
}

function mouseReleaseEvent(event) {
    mouseDown = false;

    if (lastMouseMoveEvent) {
        mouseMove(lastMouseMoveEvent);
        lastMouseMoveEvent = null;
    }
    if (propertyMenu.mouseReleaseEvent(event)) {
        return true;
    }
    if (isActive && selectionManager.hasSelection()) {
        tooltip.show(false);
    }
    if (mouseCapturedByTool) {

        return;
    }

    cameraManager.mouseReleaseEvent(event);

    if (!mouseHasMovedSincePress) {
        mouseClickEvent(event);
    }
}

function wasTabletClicked(event) {
    var rayPick = Camera.computePickRay(event.x, event.y);
    var result = Overlays.findRayIntersection(rayPick, true, [HMD.tabletID, HMD.tabletScreenID, HMD.homeButtonID]);
    return result.intersects;
}

function mouseClickEvent(event) {
    var wantDebug = false;
    var result, properties, tabletClicked;
    if (isActive && event.isLeftButton) {
        result = findClickedEntity(event);
        tabletClicked = wasTabletClicked(event);
        if (tabletClicked) {
            return;
        }

        if (result === null || result === undefined) {
            if (!event.isShifted) {
                selectionManager.clearSelections();
            }
            return;
        }
        toolBar.setActive(true);
        var pickRay = result.pickRay;
        var foundEntity = result.entityID;
        if (foundEntity === HMD.tabletID) {
            return;
        }
        properties = Entities.getEntityProperties(foundEntity);
        if (isLocked(properties)) {
            if (wantDebug) {
                print("Model locked " + properties.id);
            }
        } else {
            var halfDiagonal = Vec3.length(properties.dimensions) / 2.0;

            if (wantDebug) {
                print("Checking properties: " + properties.id + " " + " - Half Diagonal:" + halfDiagonal);
            }
            //                P         P - Model
            //               /|         A - Palm
            //              / | d       B - unit vector toward tip
            //             /  |         X - base of the perpendicular line
            //            A---X----->B  d - distance fom axis
            //              x           x - distance from A
            //
            //            |X-A| = (P-A).B
            //            X === A + ((P-A).B)B
            //            d = |P-X|

            var A = pickRay.origin;
            var B = Vec3.normalize(pickRay.direction);
            var P = properties.position;

            var x = Vec3.dot(Vec3.subtract(P, A), B);

            var angularSize = 2 * Math.atan(halfDiagonal / Vec3.distance(Camera.getPosition(), properties.position)) *
                              180 / Math.PI;

            var sizeOK = (allowLargeModels || angularSize < MAX_ANGULAR_SIZE) &&
                         (allowSmallModels || angularSize > MIN_ANGULAR_SIZE);

            if (0 < x && sizeOK) {
                selectedEntityID = foundEntity;
                orientation = MyAvatar.orientation;
                intersection = rayPlaneIntersection(pickRay, P, Quat.getForward(orientation));

                if (event.isShifted) {
                    particleExplorerTool.destroyWebView();
                }
                if (properties.type !== "ParticleEffect") {
                    particleExplorerTool.destroyWebView();
                }

                if (!event.isShifted) {
                    selectionManager.setSelections([foundEntity]);
                } else {
                    selectionManager.addEntity(foundEntity, true);
                }

                if (wantDebug) {
                    print("Model selected: " + foundEntity);
                }
                selectionDisplay.select(selectedEntityID, event);

                if (Menu.isOptionChecked(MENU_AUTO_FOCUS_ON_SELECT)) {
                    cameraManager.enable();
                    cameraManager.focus(selectionManager.worldPosition,
                        selectionManager.worldDimensions,
                        Menu.isOptionChecked(MENU_EASE_ON_FOCUS));
                }
            }
        }
    } else if (event.isRightButton) {
        result = findClickedEntity(event);
        if (result) {
            if (SHOULD_SHOW_PROPERTY_MENU !== true) {
                return;
            }
            properties = Entities.getEntityProperties(result.entityID);
            if (properties.marketplaceID) {
                propertyMenu.marketplaceID = properties.marketplaceID;
                propertyMenu.updateMenuItemText(showMenuItem, "Show in Marketplace");
            } else {
                propertyMenu.marketplaceID = null;
                propertyMenu.updateMenuItemText(showMenuItem, "No marketplace info");
            }
            propertyMenu.setPosition(event.x, event.y);
            propertyMenu.show();
        } else {
            propertyMenu.hide();
        }
    }
}

Controller.mousePressEvent.connect(mousePressEvent);
Controller.mouseMoveEvent.connect(mouseMoveEventBuffered);
Controller.mouseReleaseEvent.connect(mouseReleaseEvent);


// In order for editVoxels and editModels to play nice together, they each check to see if a "delete" menu item already
// exists. If it doesn't they add it. If it does they don't. They also only delete the menu item if they were the one that
// added it.
var modelMenuAddedDelete = false;
var originalLightsArePickable = Entities.getLightsArePickable();

function setupModelMenus() {
    // adj our menuitems
    Menu.addMenuItem({
        menuName: "Edit",
        menuItemName: "Entities",
        isSeparator: true,
        grouping: "Advanced"
    });
    if (!Menu.menuItemExists("Edit", "Delete")) {
        Menu.addMenuItem({
            menuName: "Edit",
            menuItemName: "Delete",
            shortcutKeyEvent: {
                text: "delete"
            },
            afterItem: "Entities",
            grouping: "Advanced"
        });
        modelMenuAddedDelete = true;
    }
    Menu.addMenuItem({
        menuName: "Edit",
        menuItemName: "Entity List...",
        afterItem: "Entities",
        grouping: "Advanced"
    });

    Menu.addMenuItem({
        menuName: "Edit",
        menuItemName: "Parent Entity to Last",
        afterItem: "Entity List...",
        grouping: "Advanced"
    });

    Menu.addMenuItem({
        menuName: "Edit",
        menuItemName: "Unparent Entity",
        afterItem: "Parent Entity to Last",
        grouping: "Advanced"
    });

    Menu.addMenuItem({
        menuName: GRABBABLE_ENTITIES_MENU_CATEGORY,
        menuItemName: GRABBABLE_ENTITIES_MENU_ITEM,
        afterItem: "Unparent Entity",
        isCheckable: true,
        isChecked: true,
        grouping: "Advanced"
    });

    Menu.addMenuItem({
        menuName: "Edit",
        menuItemName: "Allow Selecting of Large Models",
        afterItem: GRABBABLE_ENTITIES_MENU_ITEM,
        isCheckable: true,
        isChecked: true,
        grouping: "Advanced"
    });
    Menu.addMenuItem({
        menuName: "Edit",
        menuItemName: "Allow Selecting of Small Models",
        afterItem: "Allow Selecting of Large Models",
        isCheckable: true,
        isChecked: true,
        grouping: "Advanced"
    });
    Menu.addMenuItem({
        menuName: "Edit",
        menuItemName: "Allow Selecting of Lights",
        afterItem: "Allow Selecting of Small Models",
        isCheckable: true,
        grouping: "Advanced"
    });
    Menu.addMenuItem({
        menuName: "Edit",
        menuItemName: "Select All Entities In Box",
        afterItem: "Allow Selecting of Lights",
        grouping: "Advanced"
    });
    Menu.addMenuItem({
        menuName: "Edit",
        menuItemName: "Select All Entities Touching Box",
        afterItem: "Select All Entities In Box",
        grouping: "Advanced"
    });

    Menu.addMenuItem({
        menuName: "Edit",
        menuItemName: "Export Entities",
        afterItem: "Entities",
        grouping: "Advanced"
    });
    Menu.addMenuItem({
        menuName: "Edit",
        menuItemName: "Import Entities",
        afterItem: "Export Entities",
        grouping: "Advanced"
    });
    Menu.addMenuItem({
        menuName: "Edit",
        menuItemName: "Import Entities from URL",
        afterItem: "Import Entities",
        grouping: "Advanced"
    });

    Menu.addMenuItem({
        menuName: "Edit",
        menuItemName: MENU_AUTO_FOCUS_ON_SELECT,
        isCheckable: true,
        isChecked: Settings.getValue(SETTING_AUTO_FOCUS_ON_SELECT) === "true",
        grouping: "Advanced"
    });
    Menu.addMenuItem({
        menuName: "Edit",
        menuItemName: MENU_EASE_ON_FOCUS,
        afterItem: MENU_AUTO_FOCUS_ON_SELECT,
        isCheckable: true,
        isChecked: Settings.getValue(SETTING_EASE_ON_FOCUS) === "true",
        grouping: "Advanced"
    });
    Menu.addMenuItem({
        menuName: "Edit",
        menuItemName: MENU_SHOW_LIGHTS_AND_PARTICLES_IN_EDIT_MODE,
        afterItem: MENU_EASE_ON_FOCUS,
        isCheckable: true,
        isChecked: Settings.getValue(SETTING_SHOW_LIGHTS_AND_PARTICLES_IN_EDIT_MODE) !== "false",
        grouping: "Advanced"
    });
    Menu.addMenuItem({
        menuName: "Edit",
        menuItemName: MENU_SHOW_ZONES_IN_EDIT_MODE,
        afterItem: MENU_SHOW_LIGHTS_AND_PARTICLES_IN_EDIT_MODE,
        isCheckable: true,
        isChecked: Settings.getValue(SETTING_SHOW_ZONES_IN_EDIT_MODE) !== "false",
        grouping: "Advanced"
    });

    Entities.setLightsArePickable(false);
}

setupModelMenus(); // do this when first running our script.

function cleanupModelMenus() {
    Menu.removeSeparator("Edit", "Entities");
    if (modelMenuAddedDelete) {
        // delete our menuitems
        Menu.removeMenuItem("Edit", "Delete");
    }

    Menu.removeMenuItem("Edit", "Parent Entity to Last");
    Menu.removeMenuItem("Edit", "Unparent Entity");
    Menu.removeMenuItem("Edit", "Entity List...");
    Menu.removeMenuItem("Edit", "Allow Selecting of Large Models");
    Menu.removeMenuItem("Edit", "Allow Selecting of Small Models");
    Menu.removeMenuItem("Edit", "Allow Selecting of Lights");
    Menu.removeMenuItem("Edit", "Select All Entities In Box");
    Menu.removeMenuItem("Edit", "Select All Entities Touching Box");

    Menu.removeMenuItem("Edit", "Export Entities");
    Menu.removeMenuItem("Edit", "Import Entities");
    Menu.removeMenuItem("Edit", "Import Entities from URL");

    Menu.removeMenuItem("Edit", MENU_AUTO_FOCUS_ON_SELECT);
    Menu.removeMenuItem("Edit", MENU_EASE_ON_FOCUS);
    Menu.removeMenuItem("Edit", MENU_SHOW_LIGHTS_AND_PARTICLES_IN_EDIT_MODE);
    Menu.removeMenuItem("Edit", MENU_SHOW_ZONES_IN_EDIT_MODE);
}

Script.scriptEnding.connect(function () {
    toolBar.setActive(false);
    Settings.setValue(SETTING_AUTO_FOCUS_ON_SELECT, Menu.isOptionChecked(MENU_AUTO_FOCUS_ON_SELECT));
    Settings.setValue(SETTING_EASE_ON_FOCUS, Menu.isOptionChecked(MENU_EASE_ON_FOCUS));
    Settings.setValue(SETTING_SHOW_LIGHTS_AND_PARTICLES_IN_EDIT_MODE, Menu.isOptionChecked(MENU_SHOW_LIGHTS_AND_PARTICLES_IN_EDIT_MODE));
    Settings.setValue(SETTING_SHOW_ZONES_IN_EDIT_MODE, Menu.isOptionChecked(MENU_SHOW_ZONES_IN_EDIT_MODE));

    progressDialog.cleanup();
    cleanupModelMenus();
    tooltip.cleanup();
    selectionDisplay.cleanup();
    Entities.setLightsArePickable(originalLightsArePickable);

    Overlays.deleteOverlay(importingSVOImageOverlay);
    Overlays.deleteOverlay(importingSVOTextOverlay);

    Controller.keyReleaseEvent.disconnect(keyReleaseEvent);
    Controller.keyPressEvent.disconnect(keyPressEvent);

    Controller.mousePressEvent.disconnect(mousePressEvent);
    Controller.mouseMoveEvent.disconnect(mouseMoveEventBuffered);
    Controller.mouseReleaseEvent.disconnect(mouseReleaseEvent);

    Messages.messageReceived.disconnect(handleMessagesReceived);
    Messages.unsubscribe("entityToolUpdates");
    Messages.unsubscribe("Toolbar-DomainChanged");
    createButton = null;
});

var lastOrientation = null;
var lastPosition = null;

// Do some stuff regularly, like check for placement of various overlays
Script.update.connect(function (deltaTime) {
    progressDialog.move();
    selectionDisplay.checkMove();
    var dOrientation = Math.abs(Quat.dot(Camera.orientation, lastOrientation) - 1);
    var dPosition = Vec3.distance(Camera.position, lastPosition);
    if (dOrientation > 0.001 || dPosition > 0.001) {
        propertyMenu.hide();
        lastOrientation = Camera.orientation;
        lastPosition = Camera.position;
    }
    if (lastMouseMoveEvent) {
        mouseMove(lastMouseMoveEvent);
        lastMouseMoveEvent = null;
    }
});

function insideBox(center, dimensions, point) {
    return (Math.abs(point.x - center.x) <= (dimensions.x / 2.0)) &&
           (Math.abs(point.y - center.y) <= (dimensions.y / 2.0)) &&
           (Math.abs(point.z - center.z) <= (dimensions.z / 2.0));
}

function selectAllEtitiesInCurrentSelectionBox(keepIfTouching) {
    if (selectionManager.hasSelection()) {
        // Get all entities touching the bounding box of the current selection
        var boundingBoxCorner = Vec3.subtract(selectionManager.worldPosition,
            Vec3.multiply(selectionManager.worldDimensions, 0.5));
        var entities = Entities.findEntitiesInBox(boundingBoxCorner, selectionManager.worldDimensions);

        if (!keepIfTouching) {
            var isValid;
            if (selectionManager.localPosition === null || selectionManager.localPosition === undefined) {
                isValid = function (position) {
                    return insideBox(selectionManager.worldPosition, selectionManager.worldDimensions, position);
                };
            } else {
                isValid = function (position) {
                    var localPosition = Vec3.multiplyQbyV(Quat.inverse(selectionManager.localRotation),
                        Vec3.subtract(position,
                            selectionManager.localPosition));
                    return insideBox({
                        x: 0,
                        y: 0,
                        z: 0
                    }, selectionManager.localDimensions, localPosition);
                };
            }
            for (var i = 0; i < entities.length; ++i) {
                var properties = Entities.getEntityProperties(entities[i]);
                if (!isValid(properties.position)) {
                    entities.splice(i, 1);
                    --i;
                }
            }
        }
        selectionManager.setSelections(entities);
    }
}

function sortSelectedEntities(selected) {
    var sortedEntities = selected.slice();
    var begin = 0;
    while (begin < sortedEntities.length) {
        var elementRemoved = false;
        var next = begin + 1;
        while (next < sortedEntities.length) {
            var beginID = sortedEntities[begin];
            var nextID = sortedEntities[next];

            if (Entities.isChildOfParent(beginID, nextID)) {
                sortedEntities[begin] = nextID;
                sortedEntities[next] = beginID;
                sortedEntities.splice(next, 1);
                elementRemoved = true;
                break;
            } else if (Entities.isChildOfParent(nextID, beginID)) {
                sortedEntities.splice(next, 1);
                elementRemoved = true;
                break;
            }
            next++;
        }
        if (!elementRemoved) {
            begin++;
        }
    }
    return sortedEntities;
}

function recursiveDelete(entities, childrenList) {
    var entitiesLength = entities.length;
    for (var i = 0; i < entitiesLength; i++) {
        var entityID = entities[i];
        var children = Entities.getChildrenIDs(entityID);
        var grandchildrenList = [];
        recursiveDelete(children, grandchildrenList);
        var initialProperties = Entities.getEntityProperties(entityID);
        childrenList.push({
            entityID: entityID,
            properties: initialProperties,
            children: grandchildrenList
        });
        Entities.deleteEntity(entityID);
    }
}
function unparentSelectedEntities() {
    if (SelectionManager.hasSelection()) {
        var selectedEntities = selectionManager.selections;
        var parentCheck = false;

        if (selectedEntities.length < 1) {
            Window.notifyEditError("You must have an entity selected inorder to unparent it.");
            return;
        }
        selectedEntities.forEach(function (id, index) {
            var parentId = Entities.getEntityProperties(id, ["parentID"]).parentID;
            if (parentId !== null && parentId.length > 0 && parentId !== "{00000000-0000-0000-0000-000000000000}") {
                parentCheck = true;
            }
            Entities.editEntity(id, {parentID: null});
            return true;
        });
        if (parentCheck) {
            if (selectedEntities.length > 1) {
                Window.notify("Entities unparented");
            } else {
                Window.notify("Entity unparented");
            }
        } else {
            if (selectedEntities.length > 1) {
                Window.notify("Selected Entities have no parents");
            } else {
                Window.notify("Selected Entity does not have a parent");
            }
        }
    } else {
        Window.notifyEditError("You have nothing selected to unparent");
    }
}
function parentSelectedEntities() {
    if (SelectionManager.hasSelection()) {
        var selectedEntities = selectionManager.selections;
        if (selectedEntities.length <= 1) {
            Window.notifyEditError("You must have multiple entities selected in order to parent them");
            return;
        }
        var parentCheck = false;
        var lastEntityId = selectedEntities[selectedEntities.length-1];
        selectedEntities.forEach(function (id, index) {
            if (lastEntityId !== id) {
                var parentId = Entities.getEntityProperties(id, ["parentID"]).parentID;
                if (parentId !== lastEntityId) {
                    parentCheck = true;
                }
                Entities.editEntity(id, {parentID: lastEntityId});
            }
        });

        if (parentCheck) {
            Window.notify("Entities parented");
        }else {
            Window.notify("Entities are already parented to last");
        }
    } else {
        Window.notifyEditError("You have nothing selected to parent");
    }
}
function deleteSelectedEntities() {
    if (SelectionManager.hasSelection()) {
        selectedParticleEntityID = null;
        particleExplorerTool.destroyWebView();
        SelectionManager.saveProperties();
        var savedProperties = [];
        var newSortedSelection = sortSelectedEntities(selectionManager.selections);
        for (var i = 0; i < newSortedSelection.length; i++) {
            var entityID = newSortedSelection[i];
            var initialProperties = SelectionManager.savedProperties[entityID];
            var children = Entities.getChildrenIDs(entityID);
            var childList = [];
            recursiveDelete(children, childList);
            savedProperties.push({
                entityID: entityID,
                properties: initialProperties,
                children: childList
            });
            Entities.deleteEntity(entityID);
        }
        SelectionManager.clearSelections();
        pushCommandForSelections([], savedProperties);
    }
}

function toggleSelectedEntitiesLocked() {
    if (SelectionManager.hasSelection()) {
        var locked = !Entities.getEntityProperties(SelectionManager.selections[0], ["locked"]).locked;
        for (var i = 0; i < selectionManager.selections.length; i++) {
            var entityID = SelectionManager.selections[i];
            Entities.editEntity(entityID, {
                locked: locked
            });
        }
        entityListTool.sendUpdate();
        selectionManager._update();
    }
}

function toggleSelectedEntitiesVisible() {
    if (SelectionManager.hasSelection()) {
        var visible = !Entities.getEntityProperties(SelectionManager.selections[0], ["visible"]).visible;
        for (var i = 0; i < selectionManager.selections.length; i++) {
            var entityID = SelectionManager.selections[i];
            Entities.editEntity(entityID, {
                visible: visible
            });
        }
        entityListTool.sendUpdate();
        selectionManager._update();
    }
}

function handeMenuEvent(menuItem) {
    if (menuItem === "Allow Selecting of Small Models") {
        allowSmallModels = Menu.isOptionChecked("Allow Selecting of Small Models");
    } else if (menuItem === "Allow Selecting of Large Models") {
        allowLargeModels = Menu.isOptionChecked("Allow Selecting of Large Models");
    } else if (menuItem === "Allow Selecting of Lights") {
        Entities.setLightsArePickable(Menu.isOptionChecked("Allow Selecting of Lights"));
    } else if (menuItem === "Delete") {
        deleteSelectedEntities();
    } else if (menuItem === "Parent Entity to Last") {
        parentSelectedEntities();
    } else if (menuItem === "Unparent Entity") {
        unparentSelectedEntities();
    } else if (menuItem === "Export Entities") {
        if (!selectionManager.hasSelection()) {
            Window.notifyEditError("No entities have been selected.");
        } else {
            var filename = Window.save("Select Where to Save", "", "*.json");
            if (filename) {
                var success = Clipboard.exportEntities(filename, selectionManager.selections);
                if (!success) {
                    Window.notifyEditError("Export failed.");
                }
            }
        }
    } else if (menuItem === "Import Entities" || menuItem === "Import Entities from URL") {
        var importURL = null;
        if (menuItem === "Import Entities") {
            var fullPath = Window.browse("Select Model to Import", "", "*.json");
            if (fullPath) {
                importURL = "file:///" + fullPath;
            }
        } else {
            importURL = Window.prompt("URL of SVO to import", "");
        }

        if (importURL) {
            if (!isActive && (Entities.canRez() && Entities.canRezTmp())) {
                toolBar.toggle();
            }
            importSVO(importURL);
        }
    } else if (menuItem === "Entity List...") {
        entityListTool.toggleVisible();
    } else if (menuItem === "Select All Entities In Box") {
        selectAllEtitiesInCurrentSelectionBox(false);
    } else if (menuItem === "Select All Entities Touching Box") {
        selectAllEtitiesInCurrentSelectionBox(true);
    } else if (menuItem === MENU_SHOW_LIGHTS_AND_PARTICLES_IN_EDIT_MODE) {
        entityIconOverlayManager.setVisible(isActive && Menu.isOptionChecked(MENU_SHOW_LIGHTS_AND_PARTICLES_IN_EDIT_MODE));
    } else if (menuItem === MENU_SHOW_ZONES_IN_EDIT_MODE) {
        Entities.setDrawZoneBoundaries(isActive && Menu.isOptionChecked(MENU_SHOW_ZONES_IN_EDIT_MODE));
    }
    tooltip.show(false);
}

var HALF_TREE_SCALE = 16384;

function getPositionToCreateEntity(extra) {
    var CREATE_DISTANCE = 2;
    var position;
    var delta = extra !== undefined ? extra : 0;
    if (Camera.mode === "entity" || Camera.mode === "independent") {
        position = Vec3.sum(Camera.position, Vec3.multiply(Quat.getForward(Camera.orientation), CREATE_DISTANCE + delta));
    } else {
        position = Vec3.sum(MyAvatar.position, Vec3.multiply(Quat.getForward(MyAvatar.orientation), CREATE_DISTANCE + delta));
        position.y += 0.5;
    }

    if (position.x > HALF_TREE_SCALE || position.y > HALF_TREE_SCALE || position.z > HALF_TREE_SCALE) {
        return null;
    }
    return position;
}

function importSVO(importURL) {
    if (!Entities.canRez() && !Entities.canRezTmp()) {
        Window.notifyEditError(INSUFFICIENT_PERMISSIONS_IMPORT_ERROR_MSG);
        return;
    }

    Overlays.editOverlay(importingSVOTextOverlay, {
        visible: true
    });
    Overlays.editOverlay(importingSVOImageOverlay, {
        visible: true
    });

    var success = Clipboard.importEntities(importURL);

    if (success) {
        var VERY_LARGE = 10000;
        var isLargeImport = Clipboard.getClipboardContentsLargestDimension() >= VERY_LARGE;
        var position = Vec3.ZERO;
        if (!isLargeImport) {
            position = getPositionToCreateEntity(Clipboard.getClipboardContentsLargestDimension() / 2);
        }
        if (position !== null && position !== undefined) {
            var pastedEntityIDs = Clipboard.pasteEntities(position);
            if (!isLargeImport) {
                // The first entity in Clipboard gets the specified position with the rest being relative to it. Therefore, move
                // entities after they're imported so that they're all the correct distance in front of and with geometric mean
                // centered on the avatar/camera direction.
                var deltaPosition = Vec3.ZERO;
                var entityPositions = [];
                var entityParentIDs = [];

                var propType = Entities.getEntityProperties(pastedEntityIDs[0], ["type"]).type;
                var NO_ADJUST_ENTITY_TYPES = ["Zone", "Light", "ParticleEffect"];
                if (NO_ADJUST_ENTITY_TYPES.indexOf(propType) === -1) {
                    var targetDirection;
                    if (Camera.mode === "entity" || Camera.mode === "independent") {
                        targetDirection = Camera.orientation;
                    } else {
                        targetDirection = MyAvatar.orientation;
                    }
                    targetDirection = Vec3.multiplyQbyV(targetDirection, Vec3.UNIT_Z);

                    var targetPosition = getPositionToCreateEntity();
                    var deltaParallel = HALF_TREE_SCALE;  // Distance to move entities parallel to targetDirection.
                    var deltaPerpendicular = Vec3.ZERO;  // Distance to move entities perpendicular to targetDirection.
                    for (var i = 0, length = pastedEntityIDs.length; i < length; i++) {
                        var curLoopEntityProps = Entities.getEntityProperties(pastedEntityIDs[i], ["position", "dimensions",
                            "registrationPoint", "rotation", "parentID"]);
                        var adjustedPosition = adjustPositionPerBoundingBox(targetPosition, targetDirection,
                            curLoopEntityProps.registrationPoint, curLoopEntityProps.dimensions, curLoopEntityProps.rotation);
                        var delta = Vec3.subtract(adjustedPosition, curLoopEntityProps.position);
                        var distance = Vec3.dot(delta, targetDirection);
                        deltaParallel = Math.min(distance, deltaParallel);
                        deltaPerpendicular = Vec3.sum(Vec3.subtract(delta, Vec3.multiply(distance, targetDirection)),
                            deltaPerpendicular);
                        entityPositions[i] = curLoopEntityProps.position;
                        entityParentIDs[i] = curLoopEntityProps.parentID;
                    }
                    deltaPerpendicular = Vec3.multiply(1 / pastedEntityIDs.length, deltaPerpendicular);
                    deltaPosition = Vec3.sum(Vec3.multiply(deltaParallel, targetDirection), deltaPerpendicular);
                }

                if (grid.getSnapToGrid()) {
                    var firstEntityProps = Entities.getEntityProperties(pastedEntityIDs[0], ["position", "dimensions",
                        "registrationPoint"]);
                    var positionPreSnap = Vec3.sum(deltaPosition, firstEntityProps.position);
                    position = grid.snapToSurface(grid.snapToGrid(positionPreSnap, false, firstEntityProps.dimensions,
                            firstEntityProps.registrationPoint), firstEntityProps.dimensions, firstEntityProps.registrationPoint);
                    deltaPosition = Vec3.subtract(position, firstEntityProps.position);
                }

                if (!Vec3.equal(deltaPosition, Vec3.ZERO)) {
                    for (var editEntityIndex = 0, numEntities = pastedEntityIDs.length; editEntityIndex < numEntities; editEntityIndex++) {
                        if (Uuid.isNull(entityParentIDs[editEntityIndex])) {
                            Entities.editEntity(pastedEntityIDs[editEntityIndex], {
                                position: Vec3.sum(deltaPosition, entityPositions[editEntityIndex])
                            });
                        }
                    }
                }
            }

            if (isActive) {
                selectionManager.setSelections(pastedEntityIDs);
            }
        } else {
            Window.notifyEditError("Can't import entities: entities would be out of bounds.");
        }
    } else {
        Window.notifyEditError("There was an error importing the entity file.");
    }

    Overlays.editOverlay(importingSVOTextOverlay, {
        visible: false
    });
    Overlays.editOverlay(importingSVOImageOverlay, {
        visible: false
    });
}
Window.svoImportRequested.connect(importSVO);

Menu.menuItemEvent.connect(handeMenuEvent);

var keyPressEvent = function (event) {
    if (isActive) {
        cameraManager.keyPressEvent(event);
    }
};
var keyReleaseEvent = function (event) {
    if (isActive) {
        cameraManager.keyReleaseEvent(event);
    }
    // since sometimes our menu shortcut keys don't work, trap our menu items here also and fire the appropriate menu items
    if (event.text === "DELETE") {
        deleteSelectedEntities();
    } else if (event.text === "ESC") {
        selectionManager.clearSelections();
    } else if (event.text === "TAB") {
        selectionDisplay.toggleSpaceMode();
    } else if (event.text === "f") {
        if (isActive) {
            if (selectionManager.hasSelection()) {
                cameraManager.enable();
                cameraManager.focus(selectionManager.worldPosition,
                    selectionManager.worldDimensions,
                    Menu.isOptionChecked(MENU_EASE_ON_FOCUS));
            }
        }
    } else if (event.text === '[') {
        if (isActive) {
            cameraManager.enable();
        }
    } else if (event.text === 'g') {
        if (isActive && selectionManager.hasSelection()) {
            var newPosition = selectionManager.worldPosition;
            newPosition = Vec3.subtract(newPosition, {
                x: 0,
                y: selectionManager.worldDimensions.y * 0.5,
                z: 0
            });
            grid.setPosition(newPosition);
        }
    } else if (event.key === KEY_P && event.isControl && !event.isAutoRepeat ) {
        if (event.isShifted) {
            unparentSelectedEntities();
        } else {
            parentSelectedEntities();
        }
    }
};
Controller.keyReleaseEvent.connect(keyReleaseEvent);
Controller.keyPressEvent.connect(keyPressEvent);

function recursiveAdd(newParentID, parentData) {
    var children = parentData.children;
    for (var i = 0; i < children.length; i++) {
        var childProperties = children[i].properties;
        childProperties.parentID = newParentID;
        var newChildID = Entities.addEntity(childProperties);
        recursiveAdd(newChildID, children[i]);
    }
}

// When an entity has been deleted we need a way to "undo" this deletion.  Because it's not currently
// possible to create an entity with a specific id, earlier undo commands to the deleted entity
// will fail if there isn't a way to find the new entity id.
var DELETED_ENTITY_MAP = {};

function applyEntityProperties(data) {
    var properties = data.setProperties;
    var selectedEntityIDs = [];
    var i, entityID;
    for (i = 0; i < properties.length; i++) {
        entityID = properties[i].entityID;
        if (DELETED_ENTITY_MAP[entityID] !== undefined) {
            entityID = DELETED_ENTITY_MAP[entityID];
        }
        Entities.editEntity(entityID, properties[i].properties);
        selectedEntityIDs.push(entityID);
    }
    for (i = 0; i < data.createEntities.length; i++) {
        entityID = data.createEntities[i].entityID;
        var entityProperties = data.createEntities[i].properties;
        var newEntityID = Entities.addEntity(entityProperties);
        recursiveAdd(newEntityID, data.createEntities[i]);
        DELETED_ENTITY_MAP[entityID] = newEntityID;
        if (data.selectCreated) {
            selectedEntityIDs.push(newEntityID);
        }
    }
    for (i = 0; i < data.deleteEntities.length; i++) {
        entityID = data.deleteEntities[i].entityID;
        if (DELETED_ENTITY_MAP[entityID] !== undefined) {
            entityID = DELETED_ENTITY_MAP[entityID];
        }
        Entities.deleteEntity(entityID);
    }

    selectionManager.setSelections(selectedEntityIDs);
}

// For currently selected entities, push a command to the UndoStack that uses the current entity properties for the
// redo command, and the saved properties for the undo command.  Also, include create and delete entity data.
function pushCommandForSelections(createdEntityData, deletedEntityData) {
    var undoData = {
        setProperties: [],
        createEntities: deletedEntityData || [],
        deleteEntities: createdEntityData || [],
        selectCreated: true
    };
    var redoData = {
        setProperties: [],
        createEntities: createdEntityData || [],
        deleteEntities: deletedEntityData || [],
        selectCreated: false
    };
    for (var i = 0; i < SelectionManager.selections.length; i++) {
        var entityID = SelectionManager.selections[i];
        var initialProperties = SelectionManager.savedProperties[entityID];
        var currentProperties = Entities.getEntityProperties(entityID);
        if (!initialProperties) {
            continue;
        }
        undoData.setProperties.push({
            entityID: entityID,
            properties: initialProperties
        });
        redoData.setProperties.push({
            entityID: entityID,
            properties: currentProperties
        });
    }
    UndoStack.pushCommand(applyEntityProperties, undoData, applyEntityProperties, redoData);
}

var ENTITY_PROPERTIES_URL = Script.resolvePath('html/entityProperties.html');

var ServerScriptStatusMonitor = function(entityID, statusCallback) {
    var self = this;

    self.entityID = entityID;
    self.active = true;
    self.sendRequestTimerID = null;

    var onStatusReceived = function(success, isRunning, status, errorInfo) {
        if (self.active) {
            statusCallback({
                statusRetrieved: success,
                isRunning: isRunning,
                status: status,
                errorInfo: errorInfo
            });
            self.sendRequestTimerID = Script.setTimeout(function() {
                if (self.active) {
                    Entities.getServerScriptStatus(entityID, onStatusReceived);
                }
            }, 1000);
        }
    };
    self.stop = function() {
        self.active = false;
    };

    Entities.getServerScriptStatus(entityID, onStatusReceived);
};

var PropertiesTool = function (opts) {
    var that = {};

    var webView = null;
    webView = Tablet.getTablet("com.highfidelity.interface.tablet.system");
    webView.setVisible = function(value) {};

    var visible = false;

    // This keeps track of the last entity ID that was selected. If multiple entities
    // are selected or if no entity is selected this will be `null`.
    var currentSelectedEntityID = null;
    var statusMonitor = null;

    webView.setVisible(visible);

    that.setVisible = function (newVisible) {
        visible = newVisible;
        webView.setVisible(visible);
    };

    function updateScriptStatus(info) {
        info.type = "server_script_status";
        webView.emitScriptEvent(JSON.stringify(info));
    }

    function resetScriptStatus() {
        updateScriptStatus({
            statusRetrieved: undefined,
            isRunning: undefined,
            status: "",
            errorInfo: ""
        });
    }

    function updateSelections(selectionUpdated) {
        var data = {
            type: 'update'
        };

        if (selectionUpdated) {
            resetScriptStatus();

            if (selectionManager.selections.length !== 1) {
                if (statusMonitor !== null) {
                    statusMonitor.stop();
                    statusMonitor = null;
                }
                currentSelectedEntityID = null;
            } else if (currentSelectedEntityID != selectionManager.selections[0]) {
                if (statusMonitor !== null) {
                    statusMonitor.stop();
                }
                var entityID = selectionManager.selections[0];
                currentSelectedEntityID = entityID;
                statusMonitor = new ServerScriptStatusMonitor(entityID, updateScriptStatus);
            }
        }

        var selections = [];
        for (var i = 0; i < selectionManager.selections.length; i++) {
            var entity = {};
            entity.id = selectionManager.selections[i];
            entity.properties = Entities.getEntityProperties(selectionManager.selections[i]);
            if (entity.properties.rotation !== undefined) {
                entity.properties.rotation = Quat.safeEulerAngles(entity.properties.rotation);
            }
            if (entity.properties.keyLight !== undefined && entity.properties.keyLight.direction !== undefined) {
                entity.properties.keyLight.direction = Vec3.multiply(RADIANS_TO_DEGREES,
                                                                     Vec3.toPolar(entity.properties.keyLight.direction));
                entity.properties.keyLight.direction.z = 0.0;
            }
            selections.push(entity);
        }
        data.selections = selections;
        webView.emitScriptEvent(JSON.stringify(data));
    }
    selectionManager.addEventListener(updateSelections);

    webView.webEventReceived.connect(function (data) {
        try {
            data = JSON.parse(data);
        }
        catch(e) {
            print('Edit.js received web event that was not valid json.');
            return;
        }
        var i, properties, dY, diff, newPosition;
        if (data.type === "print") {
            if (data.message) {
                print(data.message);
            }
        } else if (data.type === "update") {
            selectionManager.saveProperties();
            if (selectionManager.selections.length > 1) {
                properties = {
                    locked: data.properties.locked,
                    visible: data.properties.visible
                };
                for (i = 0; i < selectionManager.selections.length; i++) {
                    Entities.editEntity(selectionManager.selections[i], properties);
                }
            } else if (data.properties) {
                if (data.properties.dynamic === false) {
                    // this object is leaving dynamic, so we zero its velocities
                    data.properties.velocity = {
                        x: 0,
                        y: 0,
                        z: 0
                    };
                    data.properties.angularVelocity = {
                        x: 0,
                        y: 0,
                        z: 0
                    };
                }
                if (data.properties.rotation !== undefined) {
                    var rotation = data.properties.rotation;
                    data.properties.rotation = Quat.fromPitchYawRollDegrees(rotation.x, rotation.y, rotation.z);
                }
                if (data.properties.keyLight !== undefined && data.properties.keyLight.direction !== undefined) {
                    data.properties.keyLight.direction = Vec3.fromPolar(
                        data.properties.keyLight.direction.x * DEGREES_TO_RADIANS,
                        data.properties.keyLight.direction.y * DEGREES_TO_RADIANS
                    );
                }
                Entities.editEntity(selectionManager.selections[0], data.properties);
                if (data.properties.name !== undefined || data.properties.modelURL !== undefined ||
                        data.properties.visible !== undefined || data.properties.locked !== undefined) {
                    entityListTool.sendUpdate();
                }
            }
            pushCommandForSelections();
            selectionManager._update();
        } else if (data.type === 'parent') {
            parentSelectedEntities();
        } else if (data.type === 'unparent') {
            unparentSelectedEntities();
        } else if (data.type === 'saveUserData'){
            //the event bridge and json parsing handle our avatar id string differently.
            var actualID = data.id.split('"')[1];
            Entities.editEntity(actualID, data.properties);
        } else if (data.type === "showMarketplace") {
            showMarketplace();
        } else if (data.type === "action") {
            if (data.action === "moveSelectionToGrid") {
                if (selectionManager.hasSelection()) {
                    selectionManager.saveProperties();
                    dY = grid.getOrigin().y - (selectionManager.worldPosition.y - selectionManager.worldDimensions.y / 2);
                    diff = {
                        x: 0,
                        y: dY,
                        z: 0
                    };
                    for (i = 0; i < selectionManager.selections.length; i++) {
                        properties = selectionManager.savedProperties[selectionManager.selections[i]];
                        newPosition = Vec3.sum(properties.position, diff);
                        Entities.editEntity(selectionManager.selections[i], {
                            position: newPosition
                        });
                    }
                    pushCommandForSelections();
                    selectionManager._update();
                }
            } else if (data.action === "moveAllToGrid") {
                if (selectionManager.hasSelection()) {
                    selectionManager.saveProperties();
                    for (i = 0; i < selectionManager.selections.length; i++) {
                        properties = selectionManager.savedProperties[selectionManager.selections[i]];
                        var bottomY = properties.boundingBox.center.y - properties.boundingBox.dimensions.y / 2;
                        dY = grid.getOrigin().y - bottomY;
                        diff = {
                            x: 0,
                            y: dY,
                            z: 0
                        };
                        newPosition = Vec3.sum(properties.position, diff);
                        Entities.editEntity(selectionManager.selections[i], {
                            position: newPosition
                        });
                    }
                    pushCommandForSelections();
                    selectionManager._update();
                }
            } else if (data.action === "resetToNaturalDimensions") {
                if (selectionManager.hasSelection()) {
                    selectionManager.saveProperties();
                    for (i = 0; i < selectionManager.selections.length; i++) {
                        properties = selectionManager.savedProperties[selectionManager.selections[i]];
                        var naturalDimensions = properties.naturalDimensions;

                        // If any of the natural dimensions are not 0, resize
                        if (properties.type === "Model" && naturalDimensions.x === 0 && naturalDimensions.y === 0 &&
                                naturalDimensions.z === 0) {
                            Window.notifyEditError("Cannot reset entity to its natural dimensions: Model URL" +
                                         " is invalid or the model has not yet been loaded.");
                        } else {
                            Entities.editEntity(selectionManager.selections[i], {
                                dimensions: properties.naturalDimensions
                            });
                        }
                    }
                    pushCommandForSelections();
                    selectionManager._update();
                }
            } else if (data.action === "previewCamera") {
                if (selectionManager.hasSelection()) {
                    Camera.mode = "entity";
                    Camera.cameraEntity = selectionManager.selections[0];
                }
            } else if (data.action === "rescaleDimensions") {
                var multiplier = data.percentage / 100.0;
                if (selectionManager.hasSelection()) {
                    selectionManager.saveProperties();
                    for (i = 0; i < selectionManager.selections.length; i++) {
                        properties = selectionManager.savedProperties[selectionManager.selections[i]];
                        Entities.editEntity(selectionManager.selections[i], {
                            dimensions: Vec3.multiply(multiplier, properties.dimensions)
                        });
                    }
                    pushCommandForSelections();
                    selectionManager._update();
                }
            } else if (data.action === "reloadClientScripts") {
                if (selectionManager.hasSelection()) {
                    var timestamp = Date.now();
                    for (i = 0; i < selectionManager.selections.length; i++) {
                        Entities.editEntity(selectionManager.selections[i], {
                            scriptTimestamp: timestamp
                        });
                    }
                }
            } else if (data.action === "reloadServerScripts") {
                if (selectionManager.hasSelection()) {
                    for (i = 0; i < selectionManager.selections.length; i++) {
                        Entities.reloadServerScripts(selectionManager.selections[i]);
                    }
                }
            }
        } else if (data.type === "propertiesPageReady") {
            updateSelections(true);
        }
    });

    return that;
};

var PopupMenu = function () {
    var self = this;

    var MENU_ITEM_HEIGHT = 21;
    var MENU_ITEM_SPACING = 1;
    var TEXT_MARGIN = 7;

    var overlays = [];
    var overlayInfo = {};

    var upColor = {
        red: 0,
        green: 0,
        blue: 0
    };
    var downColor = {
        red: 192,
        green: 192,
        blue: 192
    };
    var overColor = {
        red: 128,
        green: 128,
        blue: 128
    };

    self.onSelectMenuItem = function () {};

    self.addMenuItem = function (name) {
        var id = Overlays.addOverlay("text", {
            text: name,
            backgroundAlpha: 1.0,
            backgroundColor: upColor,
            topMargin: TEXT_MARGIN,
            leftMargin: TEXT_MARGIN,
            width: 210,
            height: MENU_ITEM_HEIGHT,
            font: {
                size: 12
            },
            visible: false
        });
        overlays.push(id);
        overlayInfo[id] = {
            name: name
        };
        return id;
    };

    self.updateMenuItemText = function (id, newText) {
        Overlays.editOverlay(id, {
            text: newText
        });
    };

    self.setPosition = function (x, y) {
        for (var key in overlayInfo) {
            Overlays.editOverlay(key, {
                x: x,
                y: y
            });
            y += MENU_ITEM_HEIGHT + MENU_ITEM_SPACING;
        }
    };

    self.onSelected = function () {};

    var pressingOverlay = null;
    var hoveringOverlay = null;

    self.mousePressEvent = function (event) {
        if (event.isLeftButton) {
            var overlay = Overlays.getOverlayAtPoint({
                x: event.x,
                y: event.y
            });
            if (overlay in overlayInfo) {
                pressingOverlay = overlay;
                Overlays.editOverlay(pressingOverlay, {
                    backgroundColor: downColor
                });
            } else {
                self.hide();
            }
            return false;
        }
    };
    self.mouseMoveEvent = function (event) {
        if (visible) {
            var overlay = Overlays.getOverlayAtPoint({
                x: event.x,
                y: event.y
            });
            if (!pressingOverlay) {
                if (hoveringOverlay !== null && hoveringOverlay !== null && overlay !== hoveringOverlay) {
                    Overlays.editOverlay(hoveringOverlay, {
                        backgroundColor: upColor
                    });
                    hoveringOverlay = null;
                }
                if (overlay !== hoveringOverlay && overlay in overlayInfo) {
                    Overlays.editOverlay(overlay, {
                        backgroundColor: overColor
                    });
                    hoveringOverlay = overlay;
                }
            }
        }
        return false;
    };
    self.mouseReleaseEvent = function (event) {
        var overlay = Overlays.getOverlayAtPoint({
            x: event.x,
            y: event.y
        });
        if (pressingOverlay !== null && pressingOverlay !== undefined) {
            if (overlay === pressingOverlay) {
                self.onSelectMenuItem(overlayInfo[overlay].name);
            }
            Overlays.editOverlay(pressingOverlay, {
                backgroundColor: upColor
            });
            pressingOverlay = null;
            self.hide();
        }
    };

    var visible = false;

    self.setVisible = function (newVisible) {
        if (newVisible !== visible) {
            visible = newVisible;
            for (var key in overlayInfo) {
                Overlays.editOverlay(key, {
                    visible: newVisible
                });
            }
        }
    };
    self.show = function () {
        self.setVisible(true);
    };
    self.hide = function () {
        self.setVisible(false);
    };

    function cleanup() {
        ContextOverlay.enabled = true;
        for (var i = 0; i < overlays.length; i++) {
            Overlays.deleteOverlay(overlays[i]);
        }
        Controller.mousePressEvent.disconnect(self.mousePressEvent);
        Controller.mouseMoveEvent.disconnect(self.mouseMoveEvent);
        Controller.mouseReleaseEvent.disconnect(self.mouseReleaseEvent);
    }

    Controller.mousePressEvent.connect(self.mousePressEvent);
    Controller.mouseMoveEvent.connect(self.mouseMoveEvent);
    Controller.mouseReleaseEvent.connect(self.mouseReleaseEvent);
    Script.scriptEnding.connect(cleanup);

    return this;
};


var propertyMenu = new PopupMenu();

propertyMenu.onSelectMenuItem = function (name) {

    if (propertyMenu.marketplaceID) {
        showMarketplace(propertyMenu.marketplaceID);
    }
};

var showMenuItem = propertyMenu.addMenuItem("Show in Marketplace");

var propertiesTool = new PropertiesTool();
var particleExplorerTool = new ParticleExplorerTool();
var selectedParticleEntity = 0;
var selectedParticleEntityID = null;

function selectParticleEntity(entityID) {
    var properties = Entities.getEntityProperties(entityID);
    selectedParticleEntityID = entityID;
    if (properties.emitOrientation) {
        properties.emitOrientation = Quat.safeEulerAngles(properties.emitOrientation);
    }
    var particleData = {
        messageType: "particle_settings",
        currentProperties: properties
    };
    particleExplorerTool.destroyWebView();
    particleExplorerTool.createWebView();

    selectedParticleEntity = entityID;
    particleExplorerTool.setActiveParticleEntity(entityID);

    particleExplorerTool.webView.emitScriptEvent(JSON.stringify(particleData));

    // Switch to particle explorer
    var tablet = Tablet.getTablet("com.highfidelity.interface.tablet.system");
    tablet.sendToQml({method: 'selectTab', params: {id: 'particle'}});
}

entityListTool.webView.webEventReceived.connect(function (data) {
    try {
        data = JSON.parse(data);
    } catch(e) {
        print("edit.js: Error parsing JSON: " + e.name + " data " + data);
        return;
    }

    if (data.type === 'parent') {
        parentSelectedEntities();
    } else if (data.type === 'unparent') {
        unparentSelectedEntities();
    } else if (data.type === "selectionUpdate") {
        var ids = data.entityIds;
        if (ids.length === 1) {
            if (Entities.getEntityProperties(ids[0], "type").type === "ParticleEffect") {
                if (JSON.stringify(selectedParticleEntity) === JSON.stringify(ids[0])) {
                    // This particle entity is already selected, so return
                    return;
                }
                // Destroy the old particles web view first
            } else {
                selectedParticleEntity = 0;
                particleExplorerTool.destroyWebView();
            }
        }
    }
});

}()); // END LOCAL_SCOPE
