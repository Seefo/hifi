//
//  PacketHeaders.h
//  libraries/networking/src
//
//  Created by Stephen Birarda on 4/8/13.
//  Copyright 2013 High Fidelity, Inc.
//
//  Distributed under the Apache License, Version 2.0.
//  See the accompanying file LICENSE or http://www.apache.org/licenses/LICENSE-2.0.html
//

#ifndef hifi_PacketHeaders_h
#define hifi_PacketHeaders_h

#pragma once

#include <cstdint>
#include <map>

#include <QtCore/QCryptographicHash>
#include <QtCore/QObject>
#include <QtCore/QSet>
#include <QtCore/QUuid>

// The enums are inside this PacketTypeEnum for run-time conversion of enum value to string via
// Q_ENUMS, without requiring a macro that is called for each enum value.
class PacketTypeEnum {
    Q_GADGET
    Q_ENUMS(Value)
public:
    // If adding a new packet packetType, you can replace one marked usable or add at the end.
    // This enum must hold 256 or fewer packet types (so the value is <= 255) since it is statically typed as a uint8_t
    enum class Value : uint8_t {
        Unknown,
        StunResponse,
        DomainList,
        Ping,
        PingReply,
        KillAvatar,
        AvatarData,
        InjectAudio,
        MixedAudio,
        MicrophoneAudioNoEcho,
        MicrophoneAudioWithEcho,
        BulkAvatarData,
        SilentAudioFrame,
        DomainListRequest,
        RequestAssignment,
        CreateAssignment,
        DomainConnectionDenied,
        MuteEnvironment,
        AudioStreamStats,
        DomainServerPathQuery,
        DomainServerPathResponse,
        DomainServerAddedNode,
        ICEServerPeerInformation,
        ICEServerQuery,
        OctreeStats,
        Jurisdiction,
        JurisdictionRequest,
        AssignmentClientStatus,
        NoisyMute,
        AvatarIdentity,
        NodeIgnoreRequest,
        DomainConnectRequest,
        DomainServerRequireDTLS,
        NodeJsonStats,
        OctreeDataNack,
        StopNode,
        AudioEnvironment,
        EntityEditNack,
        ICEServerHeartbeat,
        ICEPing,
        ICEPingReply,
        EntityData,
        EntityQuery,
        EntityAdd,
        EntityErase,
        EntityEdit,
        DomainServerConnectionToken,
        DomainSettingsRequest,
        DomainSettings,
        AssetGet,
        AssetGetReply,
        AssetUpload,
        AssetUploadReply,
        AssetGetInfo,
        AssetGetInfoReply,
        DomainDisconnectRequest,
        DomainServerRemovedNode,
        MessagesData,
        MessagesSubscribe,
        MessagesUnsubscribe,
        ICEServerHeartbeatDenied,
        AssetMappingOperation,
        AssetMappingOperationReply,
        ICEServerHeartbeatACK,
        NegotiateAudioFormat,
        SelectedAudioFormat,
        MoreEntityShapes,
        NodeKickRequest,
        NodeMuteRequest,
        RadiusIgnoreRequest,
        UsernameFromIDRequest,
        UsernameFromIDReply,
        ViewFrustum,
        RequestsDomainListData,
        PerAvatarGainSet,
        EntityScriptGetStatus,
        EntityScriptGetStatusReply,
        ReloadEntityServerScript,
        EntityPhysics,
        EntityServerScriptLog,
        AdjustAvatarSorting,
        OctreeFileReplacement,
        CollisionEventChanges,
        ReplicatedMicrophoneAudioNoEcho,
        ReplicatedMicrophoneAudioWithEcho,
        ReplicatedInjectAudio,
        ReplicatedSilentAudioFrame,
        ReplicatedAvatarIdentity,
        ReplicatedKillAvatar,
        ReplicatedBulkAvatarData,
        OctreeFileReplacementFromUrl,
        NUM_PACKET_TYPE
    };

    const static QHash<PacketTypeEnum::Value, PacketTypeEnum::Value> getReplicatedPacketMapping() {
        const static QHash<PacketTypeEnum::Value, PacketTypeEnum::Value> REPLICATED_PACKET_MAPPING {
            { PacketTypeEnum::Value::MicrophoneAudioNoEcho, PacketTypeEnum::Value::ReplicatedMicrophoneAudioNoEcho },
            { PacketTypeEnum::Value::MicrophoneAudioWithEcho, PacketTypeEnum::Value::ReplicatedMicrophoneAudioWithEcho },
            { PacketTypeEnum::Value::InjectAudio, PacketTypeEnum::Value::ReplicatedInjectAudio },
            { PacketTypeEnum::Value::SilentAudioFrame, PacketTypeEnum::Value::ReplicatedSilentAudioFrame },
            { PacketTypeEnum::Value::AvatarIdentity, PacketTypeEnum::Value::ReplicatedAvatarIdentity },
            { PacketTypeEnum::Value::KillAvatar, PacketTypeEnum::Value::ReplicatedKillAvatar },
            { PacketTypeEnum::Value::BulkAvatarData, PacketTypeEnum::Value::ReplicatedBulkAvatarData }
        };
        return REPLICATED_PACKET_MAPPING;
    }

    const static QSet<PacketTypeEnum::Value> getNonVerifiedPackets() {
        const static QSet<PacketTypeEnum::Value> NON_VERIFIED_PACKETS = QSet<PacketTypeEnum::Value>()
            << PacketTypeEnum::Value::NodeJsonStats << PacketTypeEnum::Value::EntityQuery
            << PacketTypeEnum::Value::OctreeDataNack << PacketTypeEnum::Value::EntityEditNack
            << PacketTypeEnum::Value::DomainListRequest << PacketTypeEnum::Value::StopNode
            << PacketTypeEnum::Value::DomainDisconnectRequest << PacketTypeEnum::Value::UsernameFromIDRequest
            << PacketTypeEnum::Value::NodeKickRequest << PacketTypeEnum::Value::NodeMuteRequest;
        return NON_VERIFIED_PACKETS;
    }

    const static QSet<PacketTypeEnum::Value> getNonSourcedPackets() {
        const static QSet<PacketTypeEnum::Value> NON_SOURCED_PACKETS = QSet<PacketTypeEnum::Value>()
            << PacketTypeEnum::Value::StunResponse << PacketTypeEnum::Value::CreateAssignment
            << PacketTypeEnum::Value::RequestAssignment << PacketTypeEnum::Value::DomainServerRequireDTLS
            << PacketTypeEnum::Value::DomainConnectRequest << PacketTypeEnum::Value::DomainList
            << PacketTypeEnum::Value::DomainConnectionDenied << PacketTypeEnum::Value::DomainServerPathQuery
            << PacketTypeEnum::Value::DomainServerPathResponse << PacketTypeEnum::Value::DomainServerAddedNode
            << PacketTypeEnum::Value::DomainServerConnectionToken << PacketTypeEnum::Value::DomainSettingsRequest
            << PacketTypeEnum::Value::DomainSettings << PacketTypeEnum::Value::ICEServerPeerInformation
            << PacketTypeEnum::Value::ICEServerQuery << PacketTypeEnum::Value::ICEServerHeartbeat
            << PacketTypeEnum::Value::ICEServerHeartbeatACK << PacketTypeEnum::Value::ICEPing
            << PacketTypeEnum::Value::ICEPingReply << PacketTypeEnum::Value::ICEServerHeartbeatDenied
            << PacketTypeEnum::Value::AssignmentClientStatus << PacketTypeEnum::Value::StopNode
            << PacketTypeEnum::Value::DomainServerRemovedNode << PacketTypeEnum::Value::UsernameFromIDReply
            << PacketTypeEnum::Value::OctreeFileReplacement << PacketTypeEnum::Value::ReplicatedMicrophoneAudioNoEcho
            << PacketTypeEnum::Value::ReplicatedMicrophoneAudioWithEcho << PacketTypeEnum::Value::ReplicatedInjectAudio
            << PacketTypeEnum::Value::ReplicatedSilentAudioFrame << PacketTypeEnum::Value::ReplicatedAvatarIdentity
            << PacketTypeEnum::Value::ReplicatedKillAvatar << PacketTypeEnum::Value::ReplicatedBulkAvatarData;
        return NON_SOURCED_PACKETS;
    }
};

using PacketType = PacketTypeEnum::Value;

const int NUM_BYTES_MD5_HASH = 16;

typedef char PacketVersion;

PacketVersion versionForPacketType(PacketType packetType);
QByteArray protocolVersionsSignature(); /// returns a unqiue signature for all the current protocols
QString protocolVersionsSignatureBase64();

#if (PR_BUILD || DEV_BUILD)
void sendWrongProtocolVersionsSignature(bool sendWrongVersion); /// for debugging version negotiation
#endif

uint qHash(const PacketType& key, uint seed);
QDebug operator<<(QDebug debug, const PacketType& type);

const PacketVersion VERSION_OCTREE_HAS_FILE_BREAKS = 1;
const PacketVersion VERSION_ENTITIES_HAVE_ANIMATION = 1;
const PacketVersion VERSION_ROOT_ELEMENT_HAS_DATA = 2;
const PacketVersion VERSION_ENTITIES_SUPPORT_SPLIT_MTU = 3;
const PacketVersion VERSION_ENTITIES_HAS_FILE_BREAKS = VERSION_ENTITIES_SUPPORT_SPLIT_MTU;
const PacketVersion VERSION_ENTITIES_SUPPORT_DIMENSIONS = 4;
const PacketVersion VERSION_ENTITIES_MODELS_HAVE_ANIMATION_SETTINGS = 5;
const PacketVersion VERSION_ENTITIES_HAVE_USER_DATA = 6;
const PacketVersion VERSION_ENTITIES_HAS_LAST_SIMULATED_TIME = 7;
const PacketVersion VERSION_MODEL_ENTITIES_SUPPORT_SHAPE_TYPE = 8;
const PacketVersion VERSION_ENTITIES_LIGHT_HAS_INTENSITY_AND_COLOR_PROPERTIES = 9;
const PacketVersion VERSION_ENTITIES_HAS_PARTICLES = 10;
const PacketVersion VERSION_ENTITIES_USE_METERS_AND_RADIANS = 11;
const PacketVersion VERSION_ENTITIES_HAS_COLLISION_MODEL = 12;
const PacketVersion VERSION_ENTITIES_HAS_MARKETPLACE_ID_DAMAGED = 13;
const PacketVersion VERSION_ENTITIES_HAS_MARKETPLACE_ID = 14;
const PacketVersion VERSION_ENTITIES_HAVE_ACCELERATION = 15;
const PacketVersion VERSION_ENTITIES_HAVE_UUIDS = 16;
const PacketVersion VERSION_ENTITIES_ZONE_ENTITIES_EXIST = 17;
const PacketVersion VERSION_ENTITIES_ZONE_ENTITIES_HAVE_DYNAMIC_SHAPE = 18;
const PacketVersion VERSION_ENTITIES_HAVE_NAMES = 19;
const PacketVersion VERSION_ENTITIES_ZONE_ENTITIES_HAVE_ATMOSPHERE = 20;
const PacketVersion VERSION_ENTITIES_ZONE_ENTITIES_HAVE_SKYBOX = 21;
const PacketVersion VERSION_ENTITIES_ZONE_ENTITIES_STAGE_HAS_AUTOMATIC_HOURDAY = 22;
const PacketVersion VERSION_ENTITIES_PARTICLE_ENTITIES_HAVE_TEXTURES = 23;
const PacketVersion VERSION_ENTITIES_HAVE_LINE_TYPE = 24;
const PacketVersion VERSION_ENTITIES_HAVE_COLLISION_SOUND_URL = 25;
const PacketVersion VERSION_ENTITIES_HAVE_FRICTION = 26;
const PacketVersion VERSION_NO_ENTITY_ID_SWAP = 27;
const PacketVersion VERSION_ENTITIES_PARTICLE_FIX = 28;
const PacketVersion VERSION_ENTITIES_LINE_POINTS = 29;
const PacketVersion VERSION_ENTITIES_FACE_CAMERA = 30;
const PacketVersion VERSION_ENTITIES_SCRIPT_TIMESTAMP = 31;
const PacketVersion VERSION_ENTITIES_SCRIPT_TIMESTAMP_FIX = 32;
const PacketVersion VERSION_ENTITIES_HAVE_SIMULATION_OWNER_AND_ACTIONS_OVER_WIRE = 33;
const PacketVersion VERSION_ENTITIES_NEW_PROTOCOL_LAYER = 35;
const PacketVersion VERSION_POLYVOX_TEXTURES = 36;
const PacketVersion VERSION_ENTITIES_POLYLINE = 37;
const PacketVersion VERSION_OCTREE_CENTERED_ORIGIN = 38;
const PacketVersion VERSION_ENTITIES_PARTICLE_MODIFICATIONS = 39;
const PacketVersion VERSION_ENTITIES_POLYVOX_NEIGHBORS = 40;
const PacketVersion VERSION_ENTITIES_PARTICLE_RADIUS_PROPERTIES = 41;
const PacketVersion VERSION_ENTITIES_PARTICLE_COLOR_PROPERTIES = 42;
const PacketVersion VERSION_ENTITIES_PROTOCOL_HEADER_SWAP = 43;
const PacketVersion VERSION_ENTITIES_PARTICLE_ELLIPSOID_EMITTER = 44;
const PacketVersion VERSION_ENTITIES_PROTOCOL_CHANNELS = 45;
const PacketVersion VERSION_ENTITIES_ANIMATION_PROPERTIES_GROUP = 46;
const PacketVersion VERSION_ENTITIES_KEYLIGHT_PROPERTIES_GROUP = 47;
const PacketVersion VERSION_ENTITIES_KEYLIGHT_PROPERTIES_GROUP_BIS = 48;
const PacketVersion VERSION_ENTITIES_PARTICLES_ADDITIVE_BLENDING = 49;
const PacketVersion VERSION_ENTITIES_POLYLINE_TEXTURE = 50;
const PacketVersion VERSION_ENTITIES_HAVE_PARENTS = 51;
const PacketVersion VERSION_ENTITIES_REMOVED_START_AUTOMATICALLY_FROM_ANIMATION_PROPERTY_GROUP = 52;
const PacketVersion VERSION_MODEL_ENTITIES_JOINTS_ON_WIRE = 53;
const PacketVersion VERSION_ENTITITES_HAVE_QUERY_BOX = 54;
const PacketVersion VERSION_ENTITITES_HAVE_COLLISION_MASK = 55;
const PacketVersion VERSION_ATMOSPHERE_REMOVED = 56;
const PacketVersion VERSION_LIGHT_HAS_FALLOFF_RADIUS = 57;
const PacketVersion VERSION_ENTITIES_NO_FLY_ZONES = 58;
const PacketVersion VERSION_ENTITIES_MORE_SHAPES = 59;
const PacketVersion VERSION_ENTITIES_PROPERLY_ENCODE_SHAPE_EDITS = 60;
const PacketVersion VERSION_MODEL_ENTITIES_SUPPORT_STATIC_MESH = 61;
const PacketVersion VERSION_MODEL_ENTITIES_SUPPORT_SIMPLE_HULLS = 62;
const PacketVersion VERSION_WEB_ENTITIES_SUPPORT_DPI = 63;
const PacketVersion VERSION_ENTITIES_ARROW_ACTION = 64;
const PacketVersion VERSION_ENTITIES_LAST_EDITED_BY = 65;
const PacketVersion VERSION_ENTITIES_SERVER_SCRIPTS = 66;
const PacketVersion VERSION_ENTITIES_PHYSICS_PACKET = 67;
const PacketVersion VERSION_ENTITIES_ZONE_FILTERS = 68;
const PacketVersion VERSION_ENTITIES_HINGE_CONSTRAINT = 69;
const PacketVersion VERSION_ENTITIES_BULLET_DYNAMICS = 70;
const PacketVersion VERSION_ENTITIES_HAS_SHOULD_HIGHLIGHT = 71;
const PacketVersion VERSION_ENTITIES_HAS_HIGHLIGHT_SCRIPTING_INTERFACE = 72;
const PacketVersion VERSION_ENTITIES_ANIMATION_ALLOW_TRANSLATION_PROPERTIES = 73;

enum class EntityQueryPacketVersion: PacketVersion {
    JSONFilter = 18,
    JSONFilterWithFamilyTree = 19
};

enum class AssetServerPacketVersion: PacketVersion {
    VegasCongestionControl = 19,
    RangeRequestSupport
};

enum class AvatarMixerPacketVersion : PacketVersion {
    TranslationSupport = 17,
    SoftAttachmentSupport,
    AvatarEntities,
    AbsoluteSixByteRotations,
    SensorToWorldMat,
    HandControllerJoints,
    HasKillAvatarReason,
    SessionDisplayName,
    Unignore,
    ImmediateSessionDisplayNameUpdates,
    VariableAvatarData,
    AvatarAsChildFixes,
    StickAndBallDefaultAvatar,
    IdentityPacketsIncludeUpdateTime,
    AvatarIdentitySequenceId,
    MannequinDefaultAvatar,
    AvatarIdentitySequenceFront,
    IsReplicatedInAvatarIdentity,
    AvatarIdentityLookAtSnapping,
};

enum class DomainConnectRequestVersion : PacketVersion {
    NoHostname = 17,
    HasHostname,
    HasProtocolVersions,
    HasMACAddress,
    HasMachineFingerprint
};

enum class DomainConnectionDeniedVersion : PacketVersion {
    ReasonMessageOnly = 17,
    IncludesReasonCode,
    IncludesExtraInfo
};

enum class DomainServerAddedNodeVersion : PacketVersion {
    PrePermissionsGrid = 17,
    PermissionsGrid
};

enum class DomainListVersion : PacketVersion {
    PrePermissionsGrid = 18,
    PermissionsGrid,
    GetUsernameFromUUIDSupport,
    GetMachineFingerprintFromUUIDSupport
};

enum class AudioVersion : PacketVersion {
    HasCompressedAudio = 17,
    CodecNameInAudioPackets,
    Exactly10msAudioPackets,
    TerminatingStreamStats,
    SpaceBubbleChanges,
    HasPersonalMute,
    HighDynamicRangeVolume,
};

enum class MessageDataVersion : PacketVersion {
    TextOrBinaryData = 18
};

#endif // hifi_PacketHeaders_h
