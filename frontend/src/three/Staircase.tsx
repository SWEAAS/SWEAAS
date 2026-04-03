/**
 * Dynamic multi-flight internal staircase at x=5.5, connecting all floors.
 *
 * Each flight alternates z-direction so the staircase zigzags upward.
 * Flight i connects floor i to floor i+1.
 */

interface StaircaseProps {
  floorCount?: number;
}

export default function Staircase({ floorCount = 3 }: StaircaseProps) {
  const STEP_W = 1.1;
  const STEP_H = 0.5;
  const STEP_D = 0.52;
  const STEP_COLOR = "#e2e8f0";
  const RAIL_COLOR = "#94a3b8";
  const X = 5.5;
  const flights = Math.max(floorCount - 1, 0);

  if (flights === 0) {
    return null;
  }

  return (
    <group>
      {Array.from({ length: flights }, (_, flight) => {
        const yBase = flight * 4;
        const zStart = flight % 2 === 0 ? 2.0 : -2.0;
        const zDir = flight % 2 === 0 ? -1 : 1;

        return (
          <group key={flight}>
            {/* Steps */}
            {Array.from({ length: 8 }, (_, i) => (
              <mesh
                key={i}
                position={[X, yBase + i * STEP_H + 0.25, zStart + zDir * i * 0.5]}
                castShadow
                receiveShadow
              >
                <boxGeometry args={[STEP_W, STEP_H, STEP_D]} />
                <meshStandardMaterial color={STEP_COLOR} />
              </mesh>
            ))}

            {/* Baluster posts */}
            {Array.from({ length: 9 }, (_, i) => (
              <mesh key={`post-${i}`} position={[X - 0.58, yBase + i * STEP_H + 0.75, zStart + zDir * i * 0.5]}>
                <cylinderGeometry args={[0.018, 0.018, 0.5, 6]} />
                <meshStandardMaterial color={RAIL_COLOR} />
              </mesh>
            ))}

            {/* Handrail */}
            <mesh
              position={[X - 0.58, yBase + 2.2, 0]}
              rotation={[flight % 2 === 0 ? Math.atan2(-4, 4) : Math.atan2(4, 4), 0, 0]}
            >
              <boxGeometry args={[0.03, 5.9, 0.03]} />
              <meshStandardMaterial color={RAIL_COLOR} metalness={0.4} />
            </mesh>

            {/* Landing platform */}
            <mesh
              position={[X, yBase + 4.1, zStart + zDir * 8 * 0.5]}
              receiveShadow
            >
              <boxGeometry args={[STEP_W, 0.18, 1.1]} />
              <meshStandardMaterial color={STEP_COLOR} />
            </mesh>
          </group>
        );
      })}
    </group>
  );
}
