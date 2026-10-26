import { supabase } from '../lib/supabase.js'

export const getSession = () => supabase.auth.getSession().then(({ data }) => data.session)

export const onAuthChange = (cb) => {
  const { data } = supabase.auth.onAuthStateChange((_evt, session) => cb(session))
  return () => data.subscription.unsubscribe()
}

/** Auth sin confirmacion de email (config Supabase). Si no hay sesion, la confirmacion esta activa. */
export async function signUp({ email, password, businessName }) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { business_name: businessName } },
  })
  if (error) throw error
  return { session: data.session }
}

export async function signIn({ email, password }) {
  const { error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) throw error
}

export const signOut = () => supabase.auth.signOut()

/** Envia el enlace de recuperacion; el enlace vuelve a /app/restablecer con sesion de recuperacion. */
export async function requestPasswordReset(email) {
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${window.location.origin}/app/restablecer`,
  })
  if (error) throw error
}

export async function updatePassword(password) {
  const { error } = await supabase.auth.updateUser({ password })
  if (error) throw error
}
