/** Basic auth trên form đăng ký — hạn chế ai được tạo tài khoản. */
export function verifyRegistrationGate(
  username: string,
  password: string
): boolean {
  const expectedUser =
    process.env.REGISTRATION_GATE_USER?.trim() || "webmaster";
  const expectedPass =
    process.env.REGISTRATION_GATE_PASSWORD?.trim() || "devcode15";
  return username === expectedUser && password === expectedPass;
}
