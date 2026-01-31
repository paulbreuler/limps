import { Select } from '@base-ui-components/react';

export function SelectFixture() {
  return (
    <Select.Root>
      <Select.Trigger render={<button>Select an option</button>} />
      <Select.Popup>
        <Select.Option value="1">Option 1</Select.Option>
        <Select.Option value="2">Option 2</Select.Option>
        <Select.Option value="3">Option 3</Select.Option>
      </Select.Popup>
    </Select.Root>
  );
}
