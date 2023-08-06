import { useState, useEffect ,useContext} from "react";
import style from "./Catalog.module.css";
import * as service from "../service/productService";
import { filter_function, sort_function } from "./filterAndSort";
import { GenderContext } from "../Context/Context";


export const Catalog = () => {
  const [product, setProduct] = useState([]);
  const { gender } = useContext(GenderContext);
  const [showProduct, setShowProduct] = useState([]);
  const [countProduct, setCountProduct] = useState(8);
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
  const seeMessage = () => {
    setShowMessage(!showMessage)
  };
  return (
    <>
      {/* <main className={style.mainContainer}> */}
      <div className={style.mainContainer}>
        <header className={style.header}>
          <h3 className={style.headerTitle}>{gender}'s </h3>
          <p className={style.headerTitleDescription}>
            Find {gender}'s athletic sneakers you can wear whether your focus
            for the day is training or chilling
          </p>
        </header>
        {/* ........................................Filter................................................. */}
        <aside className={style.filter}>
          <form onSubmit={handleSubmit} className={style.filterForm}>
            {/* ................Brand................... */}
            <div>
              <label>
                <h3 className={style.filterTitle}>Brand:</h3>
                <select id="first" name="brand" className={style.brandSelect}>
                  <option value="All" className={style.brandText}>
                    All
                  </option>
                  <option value="Adidas" className={style.brandText}>
                    Adidas
                  </option>
                  <option value="Kappa" className={style.brandText}>
                    Kappa
                  </option>
                  <option value="Puma" className={style.brandText}>
                    Puma
                  </option>
                  <option value="Nike" className={style.brandText}>
                    Nike
                  </option>
                </select>
              </label>
            </div>

            {/* ........................Price...................... */}
            <div>
              <h3 className={style.filterTitle}>Price:</h3>
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
            {/* ..................Color................... */}
            <div>
              <h3 className={style.filterTitle}>Color:</h3>
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
            <br />
            <div className={style.btnSearch}>
              <i className="fas fa-search"></i>
              <input
                type="submit"
                value="Search"
                className={style.btnSearchEl}
              />
            </div>
          </form>
        </aside>

        {/* .........................................Products................................... */}
        <section className={style.product}>
          <article className={style.container}>
            {showProduct &&
              showProduct.slice(0, countProduct).map((p) => (
                <div key={p._id} className={style.productContainer}>
                  <div>
                    <img src={p.imageUrl} alt={p.brand} className={style.img} />
                  </div>
                  <div>
                    <ul className={style.stars}>
                      <li className={style.starss}>
                        <i className="fas fa-star"></i>
                      </li>
                      <li className={style.starss}>
                        <i className="fas fa-star"></i>
                      </li>
                      <li className={style.starss}>
                        <i className="fas fa-star"></i>
                      </li>
                      <li className={style.starss}>
                        <i className="fas fa-star"></i>
                      </li>
                      <li className={style.starss}>
                        <i className="fas fa-star"></i>
                      </li>
                    </ul>
                  </div>
                  <div className={style.text}>
                    <h4 className={style.nameBrand}>{p.brand}</h4>
                    <p className={style.info}>
                      color: {p.color}, size: {p.size}
                    </p>
                    <h6 className={style.price}>
                      <span>$</span> {p.price},00{" "}
                    </h6>
                  </div>
                  <div className="buttonElement">
                    <button
                      className={style.buttonBuy}
                      onClick={() => seeMessage(showMessage)}
                    >
                      Buy
                    </button>
                  </div>
                  <div >
                    {/* <div className={`element${message}`}> */}
                    {showMessage ? (
                      <div>
                      <p className={style.btnShow}>The product has been added <span className={style.messageHide} onClick={() => seeMessage(showMessage)}>x</span></p>
                    </div>) : null}
                  </div>
                </div>
              ))}
            {countProduct <= showProduct.length && (
              <button onClick={btnLoadMore} className={style.btnMore}>
                Load more
              </button>
            )}
          </article>
          <section className={style.button}></section>
        </section>

        {/* .....................Sort............................ */}
        <section className={style.sort}>
          <h3 className={style.sortTitle}>
            <span>
              <i className="fas fa-filter"></i>
            </span>
            sort by:
          </h3>
          <div className={style.sortOptions}>
            <label>
              <select name="sort" id="second" onChange={handleSort}>
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
