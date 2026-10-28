import { DEFAULT_MATRIX, type Matrix } from './capabilities';

/**
 * The capability matrix in force. Today it is the default in code; the owner's edits (core-app §3.2.3)
 * will be read here, so every check already asks for the matrix and none has to change.
 */
export function getCapabilityMatrix(): Promise<Matrix> {
  return Promise.resolve(DEFAULT_MATRIX);
}
