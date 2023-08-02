import { useState, useEffect } from "react";
import style from "./Catalog.module.css";
import * as service from "../service/productService";
import { filter_function, sort_function } from "./filterAndSort";

export const Catalog = ({ gender }) => {
  const [product, setProduct] = useState([]);
  const [showProduct, setShowProduct] = useState([]);
  const [countProduct, setCountProduct] = useState(8);
  const [range, setRange] = useState(200);
  const [getColor, setGetColor] = useState({ color: [] });

  useEffect(() => {
    service.getCategoryGender(gender).then((result) => {
      setProduct(result);
      setShowProduct(result);
    });
  }, [gender]);

  const handleSubmit = (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.target));
    setShowProduct(filter_function(product, data, getColor));
  };

  const btnLoadMore = () => {
    setCountProduct(countProduct + 8);
  };

  const changeRange = (e) => {
    setRange(e.target.value);
  };

  const handleColor = (e) => {
    const { value, checked } = e.target;
    const { color } = getColor;

    if (checked) {
      setGetColor({
        color: [...color, value],
      });
    } else {
      setGetColor({
        color: color.filter((e) => e !== value),
      });
    }
  };

  const handleSort = (e) => {
    e.preventDefault();
    const selected = e.target.value;
    setShowProduct(sort_function(showProduct, selected));
  };

  return (
    <>
    <main>
  {/* .........................................Products................................... */}
      <article className={style.container}>
        {showProduct &&
          showProduct.slice(0, countProduct).map((p) => (
            <div key={p._id} className={style.productContainer}>
              <div>
                <img src={p.imageUrl} alt={p.brand} className={style.img} />
              </div>
              <div className={style.text}>
                <p>
                  <i className={style.nameBrand}>{p.brand}</i>
                  <br />
                  <i> color: {p.color}</i>, size: {p.size}
                </p>
                <p className={style.price}>{p.price},00 lv.</p>
              </div>
              <div className={style.buttonElement}>
                <button className={style.buttonBuy}>Buy</button>
              </div>
            </div>
          ))}
        {countProduct <= showProduct.length && (
          <button onClick={btnLoadMore}>Load more</button>
        )}
      </article>


{/* ........................................Filter................................................. */}
      <aside>
        <form onSubmit={handleSubmit}>
          {/* ................Brand................... */}
          <div>
            <label>
              <h4>Chois brand:</h4>
              <select name="brand">
                <option value="All">All</option>
                <option value="Adidas">Adidas</option>
                <option value="Kappa">Kappa</option>
                <option value="Puma">Puma</option>
                <option value="Nike">Nike</option>
              </select>
            </label>
            <input type="submit" value="Submit" />
          </div>
          <br />
          {/* ........................Price...................... */}
          <div>
            <h4>Price:</h4>
            <input
              type="range"
              onChange={changeRange}
              min={0}
              max={200}
              step={5}
              name="price"
              value={range}
            />
            {range} lv.
          </div>
          {/* ..................Color................... */}
          <div>
            <h4>Color:</h4>
            <input
              type="checkbox"
              label="white"
              value="white"
              name="color"
              onChange={handleColor}
            />
            White
            <br />
            <input
              type="checkbox"
              label="black"
              value="black"
              name="color"
              onChange={handleColor}
            />
            Black
            <br />
            <input
              type="checkbox"
              label="blue"
              value="blue"
              name="color"
              onChange={handleColor}
            />
            Blue
            <br />
            <input
              type="checkbox"
              label="pink"
              value="pink"
              name="color"
              onChange={handleColor}
            />
            Pink
          </div>
        </form>
      </aside>

      {/* .....................Sort............................ */}
      <form onChange={handleSort}>
        <h2>Sort</h2>
        <div>
          <label>
            <select name="sort">
              <option value=""></option>
              <option value="desc">A-Z</option>
              <option value="asc">Z-A</option>
              <option value="high">Price low to high </option>
              <option value="low">Price high to low</option>
            </select>
          </label>
        </div>
      </form>
      </main>
    </>
  );
};
