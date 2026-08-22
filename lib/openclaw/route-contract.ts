export type OpenClawBodyMode = 'none' | 'json';

export type OpenClawRouteContract = {
  method: 'GET' | 'POST';
  pathname: string | RegExp;
  body: OpenClawBodyMode;
};

export type OpenClawRouteTargetDecision =
  | { ok: true; method: string; pathname: string }
  | {
      ok: false;
      status: 400 | 405;
      code: 'invalid-input' | 'invalid-operation';
      message: string;
    };

function matchesPath(pathname: string, expected: string | RegExp): boolean {
  if (typeof expected === 'string') return pathname === expected;
  expected.lastIndex = 0;
  return expected.test(pathname);
}

export function validateOpenClawRouteContract(
  input: { method: string; url: string },
  contract: OpenClawRouteContract,
): OpenClawRouteTargetDecision {
  const method = input.method.toUpperCase();
  if (method !== contract.method) {
    return {
      ok: false,
      status: 405,
      code: 'invalid-operation',
      message: 'Método no permitido.',
    };
  }

  let url: URL;
  try {
    url = new URL(input.url);
  } catch {
    return {
      ok: false,
      status: 400,
      code: 'invalid-input',
      message: 'Solicitud fuera del contrato.',
    };
  }

  if (url.search !== '' || !matchesPath(url.pathname, contract.pathname)) {
    return {
      ok: false,
      status: 400,
      code: 'invalid-input',
      message: 'Solicitud fuera del contrato.',
    };
  }

  return { ok: true, method, pathname: url.pathname };
}
