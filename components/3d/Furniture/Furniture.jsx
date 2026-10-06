import { useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { palette } from "@/lib/design/tokens";
import { getBlobShadowTexture, getMaterials } from "../materials";

/**
 * Freestanding furniture. Every piece is built from a handful of primitives with
 * shared materials, is authored with its front facing local +z, and sits on y = 0.
 * When modelled GLB furniture arrives, each component can swap its primitives for
 * a model without the room config or collision changing.
 */

export function BlobShadow({ width, depth, opacity = 1 }) {
  const material = useMemo(
    () => new THREE.MeshBasicMaterial({ map: getBlobShadowTexture(), transparent: true, depthWrite: false, opacity }),
    [opacity],
  );
  return (
    <mesh rotation-x={-Math.PI / 2} position-y={0.004} material={material} renderOrder={-1}>
      <planeGeometry args={[width, depth]} />
    </mesh>
  );
}

export function Couch() {
  const m = getMaterials();
  return (
    <group>
      <BlobShadow width={2.9} depth={1.5} />
      <mesh position={[0, 0.22, 0]} material={m.upholsteryDeep}>
        <boxGeometry args={[2.3, 0.36, 0.95]} />
      </mesh>
      {[-0.54, 0.54].map((x) => (
        <mesh key={x} position={[x, 0.47, 0.06]} material={m.upholstery}>
          <boxGeometry args={[1.04, 0.15, 0.8]} />
        </mesh>
      ))}
      <mesh position={[0, 0.7, -0.36]} rotation-x={-0.12} material={m.upholstery}>
        <boxGeometry args={[2.1, 0.55, 0.22]} />
      </mesh>
      {[-1.06, 1.06].map((x) => (
        <mesh key={x} position={[x, 0.36, 0]} material={m.upholsteryDeep}>
          <boxGeometry args={[0.2, 0.42, 0.95]} />
        </mesh>
      ))}
      {/* Two pink cushions — one for each of you. */}
      {[-0.72, 0.72].map((x, i) => (
        <mesh key={x} position={[x, 0.72, -0.18]} rotation={[-0.25, i ? -0.25 : 0.25, i ? -0.08 : 0.08]} material={m.cushionPink}>
          <boxGeometry args={[0.4, 0.38, 0.12]} />
        </mesh>
      ))}
      <mesh position={[0.25, 0.56, 0.12]} rotation-z={0.04} material={m.textile}>
        <boxGeometry args={[0.7, 0.03, 0.55]} />
      </mesh>
    </group>
  );
}

export function Rug() {
  const m = getMaterials();
  return (
    <mesh rotation-x={-Math.PI / 2} position-y={0.006} material={m.rug} receiveShadow>
      <planeGeometry args={[3.3, 2.5]} />
    </mesh>
  );
}

export function CoffeeTable() {
  const m = getMaterials();
  return (
    <group>
      <BlobShadow width={1.6} depth={1} opacity={0.8} />
      <mesh position={[0, 0.41, 0]} material={m.darkWood}>
        <boxGeometry args={[1.2, 0.05, 0.64]} />
      </mesh>
      {[
        [-0.54, -0.26],
        [0.54, -0.26],
        [-0.54, 0.26],
        [0.54, 0.26],
      ].map(([x, z]) => (
        <mesh key={`${x}${z}`} position={[x, 0.2, z]} material={m.blackMetal}>
          <cylinderGeometry args={[0.018, 0.018, 0.4, 8]} />
        </mesh>
      ))}
      {/* A lived-in table: two mugs and a small candle. */}
      <mesh position={[-0.28, 0.48, 0.08]} material={m.ceramic}>
        <cylinderGeometry args={[0.042, 0.038, 0.09, 14]} />
      </mesh>
      <mesh position={[-0.16, 0.48, -0.06]} material={m.cushionPink}>
        <cylinderGeometry args={[0.042, 0.038, 0.09, 14]} />
      </mesh>
      <mesh position={[0.3, 0.47, 0]} material={m.lampShade}>
        <cylinderGeometry args={[0.05, 0.05, 0.08, 16]} />
      </mesh>
    </group>
  );
}

export function MediaConsole() {
  const m = getMaterials();
  return (
    <group>
      <BlobShadow width={2.3} depth={0.8} opacity={0.7} />
      <mesh position={[0, 0.3, 0]} material={m.darkWood}>
        <boxGeometry args={[1.9, 0.36, 0.42]} />
      </mesh>
      {[-0.86, 0.86].map((x) => (
        <mesh key={x} position={[x, 0.06, 0]} material={m.blackMetal}>
          <boxGeometry args={[0.04, 0.12, 0.38]} />
        </mesh>
      ))}
    </group>
  );
}

export function FloorLamp() {
  const m = getMaterials();
  return (
    <group>
      <BlobShadow width={0.6} depth={0.6} opacity={0.6} />
      <mesh position={[0, 0.015, 0]} material={m.blackMetal}>
        <cylinderGeometry args={[0.16, 0.18, 0.03, 20]} />
      </mesh>
      <mesh position={[0, 0.78, 0]} material={m.blackMetal}>
        <cylinderGeometry args={[0.015, 0.015, 1.5, 8]} />
      </mesh>
      <mesh position={[0, 1.55, 0]} material={m.lampShade}>
        <cylinderGeometry args={[0.16, 0.24, 0.3, 24, 1, true]} />
      </mesh>
    </group>
  );
}

const BOOK_COLORS = [palette.green600, palette.textSecondary, palette.black700, palette.green700, palette.pink500, palette.whiteSoft];

/** Shelving with books as ONE instanced mesh (one draw call for every book). */
export function Bookshelf() {
  const m = getMaterials();
  const booksRef = useRef();
  const books = useMemo(() => {
    const list = [];
    // Shelves 0–2 hold books; the top shelf stays clear for future trophies.
    [0.42, 0.9, 1.38].forEach((shelfY, shelf) => {
      let x = -0.66;
      let i = 0;
      while (x < 0.6) {
        const thickness = 0.035 + ((i * 7 + shelf * 3) % 5) * 0.008;
        const height = 0.22 + ((i * 5 + shelf) % 4) * 0.03;
        if (!(shelf === 1 && x > 0.15 && x < 0.45)) {
          list.push({ x: x + thickness / 2, y: shelfY + height / 2, height, thickness, color: BOOK_COLORS[(i + shelf * 2) % BOOK_COLORS.length] });
        }
        x += thickness + 0.004;
        i++;
      }
    });
    return list;
  }, []);

  useLayoutEffect(() => {
    const mesh = booksRef.current;
    const matrix = new THREE.Matrix4();
    const color = new THREE.Color();
    books.forEach((book, i) => {
      matrix.compose(new THREE.Vector3(book.x, book.y, 0.02), new THREE.Quaternion(), new THREE.Vector3(book.thickness, book.height, 0.24));
      mesh.setMatrixAt(i, matrix);
      mesh.setColorAt(i, color.set(book.color));
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [books]);

  const bookMaterial = useMemo(() => new THREE.MeshStandardMaterial({ roughness: 0.8 }), []);

  return (
    <group>
      <BlobShadow width={1.8} depth={0.7} opacity={0.7} />
      {[-0.74, 0.74].map((x) => (
        <mesh key={x} position={[x, 1.0, 0]} material={m.darkWood}>
          <boxGeometry args={[0.04, 2, 0.36]} />
        </mesh>
      ))}
      {[0.06, 0.42, 0.9, 1.38, 1.86, 1.98].map((y) => (
        <mesh key={y} position={[0, y, 0]} material={m.darkWood}>
          <boxGeometry args={[1.48, 0.035, 0.36]} />
        </mesh>
      ))}
      <mesh position={[0, 1.0, -0.17]} material={m.trim}>
        <planeGeometry args={[1.48, 2]} />
      </mesh>
      <instancedMesh ref={booksRef} args={[undefined, undefined, books.length]} material={bookMaterial}>
        <boxGeometry args={[1, 1, 1]} />
      </instancedMesh>
      {/* A small framed heart leaning on the middle shelf. */}
      <mesh position={[0.3, 1.04, 0.02]} rotation-x={-0.12} material={m.blackMetal}>
        <boxGeometry args={[0.2, 0.26, 0.02]} />
      </mesh>
      <mesh position={[0.3, 1.04, 0.035]} rotation-x={-0.12} material={m.heartGlow}>
        <circleGeometry args={[0.035, 16]} />
      </mesh>
    </group>
  );
}

export function Door() {
  const m = getMaterials();
  return (
    <group>
      <mesh position={[0, 1.08, 0.02]} material={m.trim}>
        <boxGeometry args={[1.12, 2.24, 0.05]} />
      </mesh>
      <mesh position={[0, 1.04, 0.05]} material={m.darkWood}>
        <boxGeometry args={[0.96, 2.08, 0.04]} />
      </mesh>
      {[0.55, 1.45].map((y) => (
        <mesh key={y} position={[0, y, 0.075]} material={m.trim}>
          <boxGeometry args={[0.72, 0.62, 0.01]} />
        </mesh>
      ))}
      <mesh position={[0.36, 1.0, 0.1]} rotation-x={Math.PI / 2} material={m.brass}>
        <cylinderGeometry args={[0.025, 0.025, 0.08, 12]} />
      </mesh>
    </group>
  );
}
