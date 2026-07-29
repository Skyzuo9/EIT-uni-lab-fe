import type { LabMapEquipmentTemplate } from './draftEquipment'

export function EquipmentThumbnail({
  template
}: {
  template: LabMapEquipmentTemplate
}): React.JSX.Element {
  return (
    <svg
      aria-hidden="true"
      className="h-full w-full"
      data-equipment-preview="isometric"
      preserveAspectRatio="xMidYMid meet"
      viewBox="0 0 160 110"
    >
      <EquipmentIsoGraphic
        accent={template.color}
        templateId={template.id}
      />
    </svg>
  )
}

export function EquipmentIsoGraphic({
  accent,
  templateId
}: {
  accent: string
  templateId: string
}): React.JSX.Element {
  return (
    <g
      data-equipment-visual={templateId}
      stroke="#d7e6ef"
      strokeLinejoin="round"
      strokeWidth="1.6"
    >
      <ellipse
        cx="80"
        cy="98"
        rx="57"
        ry="8"
        fill="#020617"
        fillOpacity="0.5"
        stroke="none"
      />
      {equipmentGraphic(templateId, accent)}
    </g>
  )
}

function equipmentGraphic(
  templateId: string,
  accent: string
): React.ReactNode {
  switch (templateId) {
    case 'liquid-handler':
      return <LiquidHandlerGraphic accent={accent} />
    case 'robotic-arm':
      return <RoboticArmGraphic accent={accent} />
    case 'centrifuge':
      return <CentrifugeGraphic accent={accent} />
    case 'incubator':
      return <IncubatorGraphic accent={accent} />
    case 'plate-reader':
      return <PlateReaderGraphic accent={accent} />
    case 'workbench':
      return <WorkbenchGraphic accent={accent} />
    default:
      return <UnknownEquipmentGraphic accent={accent} />
  }
}

function LiquidHandlerGraphic({
  accent
}: {
  accent: string
}): React.JSX.Element {
  return (
    <>
      <path d="M25 34 40 25h96l-15 9Z" fill="#e7f0f5" />
      <path d="M121 34 136 25v58l-15 10Z" fill="#688196" />
      <path d="M25 34h96v59H25Z" fill="#9bb0be" />
      <path
        d="M34 43h78v32H34Z"
        fill="#0a1c2c"
        stroke={accent}
      />
      <path d="m34 75 11-8h67v8Z" fill="#344b5e" />
      <path
        d="M47 67h55"
        fill="none"
        stroke={accent}
        strokeWidth="2"
      />
      {[50, 63, 76, 89].map((x) => (
        <rect
          key={x}
          x={x}
          y="69"
          width="8"
          height="3"
          rx="1"
          fill={accent}
          fillOpacity="0.65"
          stroke="none"
        />
      ))}
      <path d="M48 44v16h35V44" fill="none" stroke="#b9d0dd" />
      <path d="M61 46v11" fill="none" stroke={accent} strokeWidth="3" />
      <circle cx="105" cy="83" r="2.5" fill={accent} stroke="none" />
      <path d="M32 93v4m82-4v4" fill="none" stroke="#688196" strokeWidth="3" />
    </>
  )
}

function RoboticArmGraphic({
  accent
}: {
  accent: string
}): React.JSX.Element {
  return (
    <>
      <path d="m30 82 17-10h59l21 11-18 11H50Z" fill="#72899a" />
      <ellipse cx="74" cy="77" rx="20" ry="9" fill="#d5e1e8" />
      <path d="M54 77v9c0 5 9 9 20 9s20-4 20-9v-9" fill="#8198a8" />
      <ellipse
        cx="74"
        cy="76"
        rx="10"
        ry="5"
        fill={accent}
        stroke="#e2f5fb"
      />
      <path
        d="m74 75 7-30 24-19"
        fill="none"
        stroke={accent}
        strokeLinecap="round"
        strokeWidth="11"
      />
      <path
        d="m80 46 23 13 16-8"
        fill="none"
        stroke="#b9cbd6"
        strokeLinecap="round"
        strokeWidth="8"
      />
      <circle cx="81" cy="45" r="8" fill="#263d4f" />
      <circle cx="104" cy="27" r="7" fill="#263d4f" />
      <circle cx="104" cy="58" r="6" fill={accent} />
      <path
        d="m119 51 8-6m-8 6 9 4"
        fill="none"
        stroke={accent}
        strokeLinecap="round"
        strokeWidth="3"
      />
      <path
        d="M42 79v-13m65 8V61"
        fill="none"
        stroke="#526b7e"
        strokeWidth="3"
      />
    </>
  )
}

function CentrifugeGraphic({
  accent
}: {
  accent: string
}): React.JSX.Element {
  return (
    <>
      <path
        d="M34 45 50 34h70l13 10v40L117 94H48L34 84Z"
        fill="#8da4b3"
      />
      <path d="m34 45 14 10h69l16-11-13-10H50Z" fill="#dbe7ed" />
      <ellipse
        cx="83"
        cy="44"
        rx="32"
        ry="13"
        fill="#1a3142"
        stroke={accent}
      />
      <ellipse
        cx="83"
        cy="43"
        rx="23"
        ry="8"
        fill={accent}
        fillOpacity="0.26"
      />
      <circle cx="83" cy="43" r="5" fill={accent} />
      <path d="M48 55v39m69-39v39" fill="none" stroke="#60798c" />
      <rect
        x="55"
        y="68"
        width="34"
        height="11"
        rx="2"
        fill="#10283a"
        stroke="#91a9b8"
      />
      <circle cx="105" cy="74" r="3" fill={accent} stroke="none" />
    </>
  )
}

function IncubatorGraphic({
  accent
}: {
  accent: string
}): React.JSX.Element {
  return (
    <>
      <path d="m39 21 15-9h72l-15 9Z" fill="#e4eef3" />
      <path d="m111 21 15-9v76l-15 10Z" fill="#627c90" />
      <path d="M39 21h72v77H39Z" fill="#9db1bf" />
      <path
        d="M48 31h54v48H48Z"
        fill="#112a3b"
        stroke={accent}
      />
      <path
        d="M54 41h42M54 51h42M54 61h42M54 71h42"
        fill="none"
        stroke="#6f899b"
      />
      <path
        d="M96 31v48"
        fill="none"
        stroke={accent}
        strokeWidth="2.5"
      />
      <rect
        x="48"
        y="84"
        width="31"
        height="7"
        rx="1.5"
        fill="#263f52"
        stroke="none"
      />
      <circle cx="97" cy="87.5" r="2.5" fill={accent} stroke="none" />
      <path d="M46 98v3m58-3v3" fill="none" stroke="#617a8c" strokeWidth="3" />
    </>
  )
}

function PlateReaderGraphic({
  accent
}: {
  accent: string
}): React.JSX.Element {
  return (
    <>
      <path d="m29 51 20-13h83l-17 13Z" fill="#dce8ee" />
      <path d="m115 51 17-13v38L115 89Z" fill="#637d91" />
      <path d="M29 51h86v38H29Z" fill="#91a7b6" />
      <path d="M39 61h65v18H39Z" fill="#122b3d" stroke={accent} />
      <path d="M45 66h37v8H45Z" fill="#253f53" stroke="#89a4b5" />
      <path d="M45 74v10h48V74" fill="#405a6c" stroke={accent} />
      <circle cx="101" cy="70" r="3" fill={accent} stroke="none" />
      <path d="M36 89v4m72-4v4" fill="none" stroke="#617a8d" strokeWidth="3" />
    </>
  )
}

function WorkbenchGraphic({
  accent
}: {
  accent: string
}): React.JSX.Element {
  return (
    <>
      <path d="m20 46 22-13h99l-21 14Z" fill="#d9e5eb" />
      <path d="m20 46 100 1v12H20Z" fill="#8299aa" />
      <path d="m120 47 21-14v12l-21 14Z" fill="#5f788c" />
      <path
        d="M31 58v37m78-36v36m23-43v34"
        fill="none"
        stroke="#7892a5"
        strokeWidth="5"
      />
      <path d="M34 77h73v10H34Z" fill="#324b5e" stroke="#7892a5" />
      <path d="M75 42v-19h48v16" fill="none" stroke={accent} strokeWidth="3" />
      <rect
        x="84"
        y="27"
        width="29"
        height="10"
        fill="#153044"
        stroke="#7794a7"
      />
      {[44, 55, 66].map((x) => (
        <g key={x}>
          <path d={`M${x} 38v-8`} fill="none" stroke={accent} strokeWidth="3" />
          <ellipse
            cx={x}
            cy="39"
            rx="4"
            ry="2"
            fill={accent}
            stroke="none"
          />
        </g>
      ))}
    </>
  )
}

function UnknownEquipmentGraphic({
  accent
}: {
  accent: string
}): React.JSX.Element {
  return (
    <>
      <path d="M31 45 48 34h80l-16 11Z" fill="#dce8ee" />
      <path d="m112 45 16-11v48l-16 11Z" fill="#637d91" />
      <path d="M31 45h81v48H31Z" fill="#91a7b6" />
      <rect
        x="43"
        y="56"
        width="56"
        height="21"
        fill="#122b3d"
        stroke={accent}
      />
    </>
  )
}
