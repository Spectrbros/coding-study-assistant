/// <reference types="vite/client" />

declare module '*.css' {
  const content: string
  export default content
}

declare module '*.module.css' {
  const classes: Record<string, string>
  export default classes
}

declare module '*.svg' {
  const source: string
  export default source
}
