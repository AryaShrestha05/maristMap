export type ThemeMode = 'white' | 'red'

export default function ThemeSwitch({
  mode,
  onChange
}: {
  mode: ThemeMode
  onChange: (mode: ThemeMode) => void
}) {
  const isRed = mode === 'red'
  return (
    <button
      type="button"
      role="switch"
      aria-checked={isRed}
      aria-label={isRed ? 'Switch to white mode' : 'Switch to red mode'}
      title={isRed ? 'Red mode' : 'White mode'}
      className="theme-switch"
      onClick={() => onChange(isRed ? 'white' : 'red')}
    >
      <img src="/fox.png" alt="" />
    </button>
  )
}
