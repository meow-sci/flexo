import {
  Slider as AriaSlider,
  SliderTrack,
  SliderThumb,
  type SliderProps,
} from 'react-aria-components'
import { composeTw } from './styles'

export function Slider<T extends number | number[]>({ className, ...props }: SliderProps<T>) {
  return (
    <AriaSlider
      {...props}
      className={composeTw('w-full touch-none select-none', className)}
    >
      <SliderTrack className="relative flex h-5 w-full items-center">
        {({ state }) => (
          <>
            <div className="h-1.5 w-full rounded-full border border-border bg-panel-sunken" />
            <div
              className="absolute h-1.5 rounded-full bg-accent"
              style={{ width: `${state.getThumbPercent(0) * 100}%` }}
            />
            <SliderThumb className="top-1/2 size-4 rounded-full border border-border-strong bg-fg shadow transition-colors dragging:bg-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent" />
          </>
        )}
      </SliderTrack>
    </AriaSlider>
  )
}
