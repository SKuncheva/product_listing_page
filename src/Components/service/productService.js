const baseUrl= 'http://localhost:3030/data/products';

export const getCategoryGender=async(gender)=>{
    const response=await fetch(baseUrl + `?where=gender in ("${gender}")`);
    const result= await response.json();
    return result
}

