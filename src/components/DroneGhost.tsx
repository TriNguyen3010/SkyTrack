import { Line } from '@react-three/drei'
import { useMemo } from 'react'

type ScenePoint = [number, number, number]

interface DroneGhostProps {
  position: ScenePoint
  heading: ScenePoint
  color: string
  trailPoints: ScenePoint[]
  visible: boolean
  showShadow?: boolean
  lift?: number
  emphasized?: boolean
}

export function DroneGhost({
  position,
  heading,
  color,
  trailPoints,
  visible,
  showShadow = true,
  lift = 0,
  emphasized = false,
}: DroneGhostProps) {
  const yaw = useMemo(
    () => Math.atan2(heading[0], heading[2] === 0 && heading[0] === 0 ? 1 : heading[2]),
    [heading],
  )
  const shadowPosition: ScenePoint = [position[0], 0.3, position[2]]
  const dronePosition: ScenePoint = [position[0], position[1] + lift, position[2]]

  if (!visible) {
    return null
  }

  return (
    <>
      {trailPoints.length >= 2 && (
        <Line
          points={trailPoints}
          color={color}
          transparent
          opacity={emphasized ? 0.58 : 0.42}
          lineWidth={2.4}
        />
      )}

      {showShadow && (
        <mesh rotation-x={-Math.PI / 2} position={shadowPosition}>
          <circleGeometry args={[5.4, 32]} />
          <meshBasicMaterial color="#1e293b" transparent opacity={0.12} />
        </mesh>
      )}

      <group position={dronePosition} rotation={[0, yaw, 0]} scale={0.85}>
        <pointLight color={color} intensity={0.28} distance={42} />

        <mesh>
          <boxGeometry args={[6.4, 1.5, 6.4]} />
          <meshBasicMaterial color={color} transparent opacity={0.72} />
        </mesh>
        <mesh rotation-y={Math.PI / 4}>
          <boxGeometry args={[12.4, 0.44, 0.8]} />
          <meshBasicMaterial color="#ffffff" transparent opacity={0.6} />
        </mesh>
        <mesh rotation-y={-Math.PI / 4}>
          <boxGeometry args={[12.4, 0.44, 0.8]} />
          <meshBasicMaterial color="#ffffff" transparent opacity={0.6} />
        </mesh>

        <mesh position={[0, -0.55, 2.7]}>
          <coneGeometry args={[1.15, 2.3, 14]} />
          <meshBasicMaterial color="#ffffff" transparent opacity={0.82} />
        </mesh>

        <mesh scale={emphasized ? 1.18 : 1}>
          <sphereGeometry args={[4.9, 24, 24]} />
          <meshBasicMaterial color={color} transparent opacity={0.08} />
        </mesh>
      </group>
    </>
  )
}
