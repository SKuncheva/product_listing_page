import { useState, useEffect, useContext } from "react";
import * as service from "../service/productService";
import { filter_function, sort_function } from "./filterAndSort";
import { GenderContext } from "../Context/Context";
import style from "./Catalog.module.css";

export const Catalog = () => {
  const [product, setProduct] = useState([]);
  const { gender } = useContext(GenderContext);
  const [showProduct, setShowProduct] = useState([]);
  const [countProduct, setCountProduct] = useState(6);
  const [range, setRange] = useState(200);
  const [getColor, setGetColor] = useState({ color: [] });
  const [showMessage, setShowMessage] = useState(false);

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
    setCountProduct(countProduct + 6);
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
  const seeMessage = () => {
    setShowMessage(!showMessage);
  };
  return (
    <>
      <section className={style.headerElement}>
        <h3>
          <span className={style.headerTitle}>{gender}'s</span>{" "}
        </h3>
        <p>
          Find {gender}'s athletic sneakers you can wear whether your focus for
          the day is training or chilling
        </p>
      </section>
      <div className={style.mainContainer}>
        {/* ........................................Filter................................................. */}
        <aside className={style.filter}>
          <form onSubmit={handleSubmit} style={{ padding: 15 }}>
            {/* ................Brand................... */}
            <div>
              <label className={style.filterFlexDisplay}>
                <span>Brand</span>
                <select id="first" name="brand" className={style.brandOptions}>
                  <option value="All">All</option>
                  <option value="Adidas">Adidas</option>
                  <option value="Kappa">Kappa</option>
                  <option value="Puma">Puma</option>
                  <option value="Nike">Nike</option>
                </select>
              </label>
            </div>

            {/* ........................Price...................... */}
            <div className={style.filterFlexDisplay}>
              <span>Price</span>
              <div>
                <input
                  type="range"
                  onChange={changeRange}
                  min={0}
                  max={200}
                  step={5}
                  name="price"
                  value={range}
                />
                {range} $
              </div>
            </div>
            {/* ..................Color................... */}
            <div className={style.filterFlexDisplay}>
              <span>Color</span>

              <input
                type="checkbox"
                label="white"
                value="white"
                name="color"
                onChange={handleColor}
              />
              <span className={style.whiteCirkle}></span>
              <br />
              <input
                type="checkbox"
                label="black"
                value="black"
                name="color"
                onChange={handleColor}
              />
              <i className="fas fa-circle" style={{ color: "black" }}></i>
              <br />
              <input
                type="checkbox"
                label="blue"
                value="blue"
                name="color"
                onChange={handleColor}
              />
              <i className="fas fa-circle" style={{ color: "lightBlue" }}></i>
              <br />
              <input
                type="checkbox"
                label="pink"
                value="pink"
                name="color"
                onChange={handleColor}
              />
              <i className="fas fa-circle" style={{ color: "pink" }}></i>
            </div>
            <br />
            <div className={style.searchBtn}>
              <i className="fas fa-search">
                {" "}
                <input
                  className={style.searchBtnText}
                  type="submit"
                  value="Search"
                />
              </i>
            </div>
          </form>
        </aside>

        {/* .........................................Products................................... */}
        <section className={style.product}>
          <article className={style.productContainer}>
            {showProduct &&
              showProduct.slice(0, countProduct).map((p) => (
                <div key={p._id} className={style.productCard}>
                  <div>
                    <img
                      src={p.imageUrl}
                      alt={p.brand}
                      className={style.imgProduct}
                    />
                  </div>

                  <div className={style.productInfo}>
                    <span className={style.titleProduct}>{p.brand}</span>

                    <p>
                      {" "}
                      {p.color && p.color === "white" ? (
                        <i class="far fa-circle" style={{ fontSize: 29 }}></i>
                      ) : (
                        <i
                          className="fas fa-circle"
                          style={{
                            backgroundColor:
                              `${p.color}` === "blue"
                                ? `light${p.color}`
                                : `${p.color}`,
                            borderRadius: "60%",
                            fontSize: 29,
                            border: 2,
                            color: "transparent",
                          }}
                        ></i>
                      )}
                      <span style={{ color: "silver" }}>\</span>
                      <span className={style.shoeSize}>
                        <i className="fas fa-shoe-prints"></i>
                        <span className={style.sizeNumber}>{p.size}</span>
                      </span>
                    </p>
                    <p style={{ fontSize: 16 }}>
                      Modern, stylish and comfortable every day with {p.brand}
                    </p>
                    <div className="starsContainer">
                      <ul className={style.stars}>
                        <li className={style.starsColor}>
                          <i className="fas fa-star"></i>
                        </li>
                        <li className={style.starsColor}>
                          <i className="fas fa-star"></i>
                        </li>
                        <li className={style.starsColor}>
                          <i className="fas fa-star"></i>
                        </li>
                        <li className={style.starsColor}>
                          <i className="fas fa-star"></i>
                        </li>
                        <li className={style.starsColor}>
                          <i className="fas fa-star"></i>
                        </li>
                      </ul>
                    </div>
                  </div>

                  <div>
                    <button
                      onClick={() => seeMessage(showMessage)}
                      className={style.btnBuy}
                    >
                      <span>$</span> {p.price},00
                    </button>
                  </div>
                </div>
              ))}
            {/* ............................................Message...................................... */}
            <div className="message">
              {showMessage ? (
                <div className={style.message}>
                  <span className={style.check}>
                    <i className="fas fa-check"></i>
                  </span>
                  <p className={style.textMessage}>
                    The product has been added
                    <span
                      onClick={() => seeMessage(showMessage)}
                      className={style.closeMessage}
                    >
                      <i
                        className="fas fa-times"
                        style={{ cursor: "pointer" }}
                      ></i>
                    </span>
                  </p>
                </div>
              ) : null}
            </div>
          
          </article>
            {/* .......................................Button More................................................... */}
            {countProduct <= showProduct.length && (
              <button className={style.btnLoadMore} onClick={btnLoadMore}>
                Load more
              </button>
            )}
        </section>

        {/* .....................Sort............................ */}
        <section className={style.sort}>
          <h3 className={style.sortText}>
            <span>
              <i className="fas fa-filter"></i>
            </span>
            sort by
          </h3>
          <div>
            <label>
              <select
                name="sort"
                id="second"
                onChange={handleSort}
                style={{ fontSize: 17 }}
              >
                <option value=""></option>
                <option value="desc">A-Z</option>
                <option value="asc">Z-A</option>
                <option value="high">Price low to high </option>
                <option value="low">Price high to low</option>
              </select>
            </label>
          </div>
        </section>
        {/* </main> */}
      </div>
    </>
  );
};
