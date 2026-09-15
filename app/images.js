export const validImageSource=value=>typeof value==='string'&&value.length<=3000000&&(value===''||/^\.\/assets\/[a-zA-Z0-9_\-/]+\.(svg|png|jpe?g|webp)$/i.test(value)||/^data:image\/(png|jpeg|webp|svg\+xml);base64,[a-zA-Z0-9+/=]+$/.test(value));

// Shared by browser and PDF exports so every uploaded logo travels with its résumé.
export function imageSlots(data){
  return [{owner:data.profile,key:'logo'},{owner:data.profile,key:'photo'},...(data.internships||[]).map(owner=>({owner,key:'logo'}))];
}
