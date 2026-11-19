import type { ComponentChildren } from "preact";
import { Device, type DeviceProps } from "./Device";

export interface AppProps extends DeviceProps {
  /** Sheets and notices render here, over the page. */
  sheets?: ComponentChildren;
}

/** The page: a 390 wide column with the device and the host for sheets. */
export function App(props: AppProps) {
  const { sheets, ...device } = props;
  return (
    <div class="page">
      <Device {...device} />
      <div class="sheet-host">{sheets}</div>
    </div>
  );
}
