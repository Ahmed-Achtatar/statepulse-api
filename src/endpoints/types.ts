export type JsonSchema = Record<string, unknown>

export type EndpointContext = {
  env: {
    CACHE: KVNamespace
    [key: string]: unknown
  }
  req: { url: string }
  executionCtx?: { waitUntil: (p: Promise<unknown>) => void }
}

export type EndpointDef = {
  path: string
  operationId: string
  summary: string
  description: string
  priceUsd: string
  free: boolean
  requestSchema: JsonSchema
  responseSchema: JsonSchema
  tags: string[]
  category: string
  whenToUse: string
  doNotUseFor: string
  exampleInput: () => Record<string, unknown>
  exampleOutput: () => unknown
  logic: (args: Record<string, unknown>, c?: any) => Promise<unknown> | unknown
  skillId: string
  skillName: string
  skillExamples: string[]
}

export function priceToAtomic(priceUsd: string): string {
  return Math.round(Number(priceUsd) * 1_000_000).toString()
}

export function validationError(message: string): Error {
  const error = new Error(message)
  ;(error as any).status = 400
  return error
}
