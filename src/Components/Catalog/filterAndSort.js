export const filter_function = (product, filterProd, colorProd) => {
  let result = product;

  result = result.filter((p) => {
    return (
      filterProd.brand === "All" || p.brand === filterProd.brand);
  });

  result = result.filter((p) => {
    return p.price <= filterProd.price;
  });

  if (colorProd && colorProd.color.length > 0) {
    let newResult = [];
    result.map((p) => colorProd.color.includes(p.color) && newResult.push(p));
    result = newResult;
  }

  return result;
};


export const sort_function= (product, type)=>{
  let result = product
    if (type === "desc") {
      result = (product) => [...product.sort((a,b) => a.brand.toLowerCase()>b.brand.toLowerCase() ? 1 :-1)]
    }
    if (type === "asc") {
      result = (product) => [...product.sort((a,b) => b.brand.toLowerCase()>a.brand.toLowerCase() ? 1 :-1)]
    }
    if (type === "high") {
      result = (product) => [...product.sort((a,b) => a.price-b.price)]
    }
    if (type === "low") {
      result = (product) => [...product.sort((a,b) => b.price-a.price)]
    }
    return result
}