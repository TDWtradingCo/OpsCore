import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const baseUrl = process.env.PRODUCT_API_BASE_URL ?? 'http://localhost:3001'
const email = process.env.PRODUCT_API_TEST_EMAIL
const password = process.env.PRODUCT_API_TEST_PASSWORD
const rootEnv = readEnvFile(resolve('.env'))
const backendEnv = readEnvFile(resolve('backend/.env'))
const supabaseUrl = process.env.SUPABASE_AUTH_URL ?? process.env.VITE_SUPABASE_URL ?? backendEnv.SUPABASE_AUTH_URL ?? rootEnv.SUPABASE_AUTH_URL ?? rootEnv.VITE_SUPABASE_URL
const supabaseAnonKey = process.env.SUPABASE_AUTH_ANON_KEY ?? process.env.VITE_SUPABASE_ANON_KEY ?? backendEnv.SUPABASE_AUTH_ANON_KEY ?? rootEnv.SUPABASE_AUTH_ANON_KEY ?? rootEnv.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing frontend auth Supabase config. Set SUPABASE_AUTH_URL/SUPABASE_AUTH_ANON_KEY or VITE_SUPABASE_URL/VITE_SUPABASE_ANON_KEY.')
}

if (!email || !password) {
  throw new Error('Missing PRODUCT_API_TEST_EMAIL or PRODUCT_API_TEST_PASSWORD in the shell environment.')
}

const responses = []

const auth = await request('Supabase Login', `${supabaseUrl}/auth/v1/token?grant_type=password`, {
  method: 'POST',
  headers: {
    apikey: supabaseAnonKey,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({ email, password }),
  redact: redactAuthResponse,
})

const accessToken = auth.body?.access_token
if (!accessToken) {
  printResponses()
  process.exitCode = 1
} else {
  const productCodeInteger = Math.floor(Date.now() / 1000)

  await request('Health Check', `${baseUrl}/api/health`)

  await request('Current User', `${baseUrl}/api/me`, {
    headers: authHeaders(accessToken),
  })

  const productCreate = await request('Create Product', `${baseUrl}/api/product`, {
    method: 'POST',
    headers: jsonAuthHeaders(accessToken),
    body: JSON.stringify({
      productCodeInteger,
      name: `API Test Product ${productCodeInteger}`,
      brand: 'Waitley',
      imageUrl: 'https://example.com/product-image.jpg',
    }),
  })

  const productId = productCreate.body?.id

  await request('List Products', `${baseUrl}/api/products`, {
    headers: authHeaders(accessToken),
  })

  if (productId) {
    await request('Get Product By ID', `${baseUrl}/api/product/${productId}`, {
      headers: authHeaders(accessToken),
    })

    await request('Patch Product', `${baseUrl}/api/product/${productId}`, {
      method: 'PATCH',
      headers: jsonAuthHeaders(accessToken),
      body: JSON.stringify({
        imageUrl: 'https://example.com/product-image-patched.jpg',
      }),
    })

    await request('Put Product', `${baseUrl}/api/product/${productId}`, {
      method: 'PUT',
      headers: jsonAuthHeaders(accessToken),
      body: JSON.stringify({
        productCodeInteger,
        name: `API Test Product ${productCodeInteger}`,
        brand: 'Waitley Updated',
        imageUrl: 'https://example.com/product-image-put.jpg',
      }),
    })

    const variantCreate = await request('Create Variant', `${baseUrl}/api/product/${productId}/variant`, {
      method: 'POST',
      headers: jsonAuthHeaders(accessToken),
      body: JSON.stringify({
        variantCode: 0,
        variantType: 'Colour',
        variantValue: 'Blue',
        condition: 'New',
        quantity: 100,
        imageUrl: 'https://example.com/variant-image.jpg',
      }),
    })

    const variantId = variantCreate.body?.id

    if (variantId) {
      await request('Get Variant By ID', `${baseUrl}/api/variant/${variantId}`, {
        headers: authHeaders(accessToken),
      })

      await request('Patch Variant', `${baseUrl}/api/variant/${variantId}`, {
        method: 'PATCH',
        headers: jsonAuthHeaders(accessToken),
        body: JSON.stringify({
          condition: 'Open Box',
          quantity: 200,
        }),
      })

      await request('Put Variant', `${baseUrl}/api/variant/${variantId}`, {
        method: 'PUT',
        headers: jsonAuthHeaders(accessToken),
        body: JSON.stringify({
          variantCode: 0,
          variantType: 'Colour',
          variantValue: 'Blue',
          condition: 'Open Box',
          quantity: 200,
          imageUrl: 'https://example.com/variant-image-put.jpg',
        }),
      })
    }
  }

  await request('List Products After Writes', `${baseUrl}/api/products`, {
    headers: authHeaders(accessToken),
  })

  printResponses()

  if (responses.some((response) => response.status >= 400)) {
    process.exitCode = 1
  }
}

async function request(name, url, options = {}) {
  const { redact, ...fetchOptions } = options
  let status = 0
  let body = null

  try {
    const response = await fetch(url, fetchOptions)
    status = response.status
    body = await parseBody(response)
  } catch (error) {
    body = { error: error instanceof Error ? error.message : String(error) }
  }

  const record = {
    name,
    status,
    body: redact ? redact(body) : body,
  }

  responses.push(record)
  return { status, body }
}

async function parseBody(response) {
  const text = await response.text()
  if (!text) {
    return null
  }

  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

function authHeaders(accessToken) {
  return {
    Authorization: `Bearer ${accessToken}`,
  }
}

function jsonAuthHeaders(accessToken) {
  return {
    ...authHeaders(accessToken),
    'Content-Type': 'application/json',
  }
}

function redactAuthResponse(body) {
  if (!body || typeof body !== 'object') {
    return body
  }

  return {
    accessTokenReceived: Boolean(body.access_token),
    refreshTokenReceived: Boolean(body.refresh_token),
    tokenType: body.token_type,
    expiresIn: body.expires_in,
    user: body.user
      ? {
          id: body.user.id,
          email: body.user.email,
        }
      : undefined,
    error: body.error,
    errorDescription: body.error_description,
    msg: body.msg,
  }
}

function printResponses() {
  console.log(JSON.stringify(responses, null, 2))
}

function readEnvFile(path) {
  try {
    return Object.fromEntries(
      readFileSync(path, 'utf8')
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line && !line.startsWith('#'))
        .map((line) => {
          const separator = line.indexOf('=')
          return [line.slice(0, separator), line.slice(separator + 1)]
        })
        .filter(([key]) => key),
    )
  } catch {
    return {}
  }
}