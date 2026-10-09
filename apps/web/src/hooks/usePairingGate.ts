import { useEffect, useState } from "react";
import {
  getPairingGate,
  type PairingGateState,
  subscribePairingGate,
} from "../lib/pairing_gate";

export function usePairingGate(): PairingGateState {
  const [gate, setGate] = useState<PairingGateState>(() => getPairingGate());
  useEffect(() => subscribePairingGate(() => setGate(getPairingGate())), []);
  return gate;
}
