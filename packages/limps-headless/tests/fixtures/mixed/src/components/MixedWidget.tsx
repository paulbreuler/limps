import * as Dialog from '@radix-ui/react-dialog';
import { Tooltip } from '@base-ui-components/react';

export function MixedWidgetFixture() {
  return (
    <Dialog.Root>
      <Dialog.Trigger asChild>
        <Tooltip.Root>
          <Tooltip.Trigger render={<button>Open with tooltip</button>} />
          <Tooltip.Popup>Click to open dialog</Tooltip.Popup>
        </Tooltip.Root>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay />
        <Dialog.Content>
          <Dialog.Title>Mixed Widget</Dialog.Title>
          <Dialog.Description>This component uses both Radix and Base UI.</Dialog.Description>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
