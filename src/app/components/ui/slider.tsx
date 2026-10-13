import * as React from "react"
import * as SliderPrimitive from "@radix-ui/react-slider"
import { cn } from "./button"

const Slider = React.forwardRef<
  React.ElementRef<typeof SliderPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof SliderPrimitive.Root>
>(({ className, ...props }, ref) => (
  <SliderPrimitive.Root
    ref={ref}
    className={cn(
      "relative flex w-full touch-none select-none items-center",
      className
    )}
    {...props}
  >
    <SliderPrimitive.Track data-slot="track" className="relative h-1.5 w-full grow overflow-hidden rounded-full bg-[var(--usb-border-mid,rgba(0,0,0,0.15))]">
      <SliderPrimitive.Range data-slot="range" className="absolute h-full bg-[var(--usb-accent,#6d4aff)]" />
    </SliderPrimitive.Track>
    <SliderPrimitive.Thumb data-slot="thumb" className="block h-4 w-4 rounded-full border-2 border-[var(--usb-accent,#6d4aff)] bg-white shadow-[0_1px_4px_rgba(20,16,50,0.35)] hover:scale-110 active:scale-95 transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50" />
  </SliderPrimitive.Root>
))
Slider.displayName = SliderPrimitive.Root.displayName

export { Slider }
