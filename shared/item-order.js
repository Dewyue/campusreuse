// IDs are allocated on publication; legacy sort keys fall back to newest first.
export function sortItems(items,mode='new'){
 return items.sort((a,b)=>(mode==='price'?a.price-b.price:0)||b.id-a.id);
}
