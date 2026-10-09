/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/**/*.{js,jsx,ts,tsx}",
  ] ,
  theme: {
    fontFamily:{
      mont:['Montserrat']
    },
    extend: {},
  },
  plugins: [require("daisyui")],
}
