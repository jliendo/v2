import { main } from "./minibrowser";
type DtEvent = {
  sucursal: string;
  fecha: string;
};
export async function lambdaHandler(event: DtEvent): Promise<void> {
  await main(event.sucursal, event.fecha);
}
