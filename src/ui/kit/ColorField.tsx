import {
  ColorPicker,
  ColorArea,
  ColorSlider,
  ColorSwatch,
  ColorThumb,
  ColorField as AriaColorField,
  Button as AriaButton,
  DialogTrigger,
  Input,
  SliderTrack,
  type Color,
} from 'react-aria-components';
import { tv } from 'tailwind-variants';
import { inputStyles } from './Field';
import { Popover, PopoverDialog } from './Popover';
import { cn, focusRing } from './styles';

const trigger = tv({
  extend: focusRing,
  base: 'inline-flex cursor-default select-none items-center gap-1.5 rounded-md text-xs text-fg',
});

const swatch = tv({
  base: 'rounded border border-border',
  variants: { size: { xs: 'size-4', sm: 'size-5' } },
  defaultVariants: { size: 'sm' },
});

const thumb =
  'size-4 top-[50%] left-[50%] box-border rounded-full border-2 border-white shadow-[0_0_0_1px_rgba(0,0,0,0.6)]';

/** Alpha-aware swatch fill: the color over a checkerboard, so 50% opacity reads as 50%. */
function swatchStyle({ color }: { color: Color }) {
  const css = color.toString('css');
  return {
    background:
      `linear-gradient(${css}, ${css}), ` +
      'repeating-conic-gradient(#3f3f46 0% 25%, #71717a 0% 50%) 50% / 8px 8px',
  };
}

/**
 * The kit color picker (design-system-services §7.7) — a swatch button that opens a
 * popover with a saturation/brightness area, a hue slider, an optional alpha slider and a
 * hex field. Closes the gap left by the native `<input type="color">`, which has no alpha
 * channel and no styling.
 *
 * react-aria's color pieces are imported here and ONLY here: the kit is the sanctioned
 * react-aria wrapper layer.
 *
 * The hex field is deliberately NOT a `useNumberDraft` field — a hex string is not a
 * number, so react-aria's own ColorField semantics apply (design-system-services §7.7).
 * Those semantics are 6-digit: committing the hex field sets alpha back to opaque, so in
 * `alpha` mode opacity is authored with the alpha slider, not by typing 8 digits.
 */

export function ColorField({
  label,
  value,
  alpha = false,
  onChange,
  onInteractionStart,
  size = 'sm',
  'aria-label': ariaLabel,
}: {
  label?: React.ReactNode;
  /** `#rrggbb`, or `#rrggbbaa` when `alpha`. */
  value: string;
  /** Adds the alpha slider and makes `onChange` emit `#rrggbbaa`. */
  alpha?: boolean;
  /** Live-commits while dragging. Hex is emitted lowercase. */
  onChange: (hex: string) => void;
  /**
   * Undo contract: fired ONCE when the popover opens, so a whole picking session is one
   * undo step (the same convention as SliderRow's pointer-down hook).
   */
  onInteractionStart?: () => void;
  size?: 'xs' | 'sm';
  'aria-label'?: string;
}) {
  const format = alpha ? 'hexa' : 'hex';
  return (
    <ColorPicker value={value} onChange={(color) => onChange(color.toString(format).toLowerCase())}>
      <DialogTrigger
        onOpenChange={(isOpen) => {
          if (isOpen) onInteractionStart?.();
        }}
      >
        <AriaButton
          aria-label={ariaLabel ?? (typeof label === 'string' ? label : 'Color')}
          className={trigger}
        >
          <ColorSwatch className={swatch({ size })} style={swatchStyle} />
          {label !== undefined && <span className="min-w-0 truncate">{label}</span>}
        </AriaButton>
        <Popover placement="bottom start">
          <PopoverDialog className="flex w-56 flex-col gap-2 p-2">
            <ColorArea
              colorSpace="hsb"
              xChannel="saturation"
              yChannel="brightness"
              className="aspect-square w-full rounded-md"
            >
              <ColorThumb className={thumb} />
            </ColorArea>
            <ColorSlider colorSpace="hsb" channel="hue" className="w-full">
              <SliderTrack className="h-3 rounded-full">
                <ColorThumb className={thumb} />
              </SliderTrack>
            </ColorSlider>
            {alpha && (
              <ColorSlider channel="alpha" className="w-full">
                <SliderTrack
                  className="h-3 rounded-full"
                  style={({ defaultStyle }) => ({
                    background:
                      `${defaultStyle.background}, ` +
                      'repeating-conic-gradient(#3f3f46 0% 25%, #71717a 0% 50%) 50% / 8px 8px',
                  })}
                >
                  <ColorThumb className={thumb} />
                </SliderTrack>
              </ColorSlider>
            )}
            <AriaColorField aria-label="Hex">
              <Input className={cn(inputStyles({ size: 'sm' }), 'font-mono uppercase')} />
            </AriaColorField>
          </PopoverDialog>
        </Popover>
      </DialogTrigger>
    </ColorPicker>
  );
}
