/**
 * Two-flight internal staircase at x=4.5, connecting all three floors.
 *
 * Flight A (floor 0 → 1): steps go from z=+2.0 to z=−2.0 while y climbs 0→4.
 * Flight B (floor 1 → 2): steps go from z=−2.0 to z=+2.0 while y climbs 4→8.
 * Agents following PRODUCT_PATH naturally pass through these step positions.
 */
export default function Staircase() {
  const STEP_W = 1.1;
  const STEP_H = 0.5;
  const STEP_D = 0.52;
  const STEP_COLOR = "#e2e8f0";
  const RAIL_COLOR = "#94a3b8";
  const X = 4.5;

  return (
    <group>
      {[0, 1].map((flight) => {
        const yBase = flight * 4;
        const zStart = flight === 0 ? 2.0 : -2.0;
        const zDir = flight === 0 ? -1 : 1; // z direction per step

        return (
          <group key={flight}>
            {/* ── Steps ── */}
            {Array.from({ length: 8 }, (_, i) => {
              const stepY = yBase + i * 0.5 + 0.25;
              const stepZ = zStart + zDir * i * 0.5;
              return (
                <mesh
                  key={i}
                  position={[X, stepY, stepZ]}
                  castShadow
                  receiveShadow
                >
                  <boxGeometry args={[STEP_W, STEP_H, STEP_D]} />
                  <meshStandardMaterial color={STEP_COLOR} />
                </mesh>
              );
            })}

            {/* ── Baluster posts – inner side (x=3.95) ── */}
            {Array.from({ length: 9 }, (_, i) => {
              const postY = yBase + i * 0.5 + 0.75;
              const postZ = zStart + zDir * i * 0.5;
              return (
                <mesh key={i} position={[X - 0.58, postY, postZ]}>
                  <cylinderGeometry args={[0.018, 0.018, 0.5, 6]} />
                  <meshStandardMaterial color={RAIL_COLOR} />
                </mesh>
              );
            })}

            {/* ── Handrail beam ── */}
            {/* Approximate the slanted rail with a thin rotated box */}
            <mesh
              position={[
                X - 0.58,
                yBase + 2.2,
                flight === 0 ? 0 : 0,
              ]}
              rotation={[
                flight === 0 ? Math.atan2(-4, 4) : Math.atan2(4, 4),
                0,
                0,
              ]}
            >
              <boxGeometry args={[0.03, 5.9, 0.03]} />
              <meshStandardMaterial color={RAIL_COLOR} metalness={0.4} />
            </mesh>

            {/* ── Landing platform at top of flight ── */}
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
