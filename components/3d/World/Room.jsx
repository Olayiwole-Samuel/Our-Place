import { Bookshelf, CoffeeTable, Couch, Door, FloorLamp, MediaConsole, Rug } from "../Furniture/Furniture";
import { GameCorner } from "../Furniture/GameCorner";
import { Plant } from "../Furniture/Plant";
import { LoveHeart, MessageBoard, PhotoWall, VideoScreen } from "../Furniture/WallFeatures";
import { RoomShell } from "../Environment/RoomShell";
import { CameraOccluder } from "./CameraOccluder";

/**
 * Renders a room configuration. Object `type` → component; adding a new kind of
 * object means adding one entry here and listing it in the config.
 */
const OBJECT_COMPONENTS = {
  couch: Couch,
  rug: Rug,
  coffeeTable: CoffeeTable,
  mediaConsole: MediaConsole,
  floorLamp: FloorLamp,
  bookshelf: Bookshelf,
  door: Door,
  plant: Plant,
  photoWall: PhotoWall,
  videoScreen: VideoScreen,
  messageBoard: MessageBoard,
  gameCorner: GameCorner,
  loveHeart: LoveHeart,
};

export function Room({ room, timeOfDay, reducedMotion, runtime }) {
  return (
    <group name={room.id}>
      <RoomShell room={room} timeOfDay={timeOfDay} />
      {room.objects.map((object) => {
        const Component = OBJECT_COMPONENTS[object.type];
        if (!Component) return null;
        const extra = object.type === "plant" ? { stage: room.plantStage } : object.type === "gameCorner" || object.type === "loveHeart" ? { reducedMotion } : {};
        return (
          <group key={object.id} name={object.id} position={[object.position[0], 0, object.position[1]]} rotation-y={object.rotation ?? 0}>
            {object.occluder && runtime ? (
              <CameraOccluder runtime={runtime} x={object.position[0]} z={object.position[1]} radius={object.occluder.radius}>
                <Component {...extra} />
              </CameraOccluder>
            ) : (
              <Component {...extra} />
            )}
          </group>
        );
      })}
    </group>
  );
}
