import { useState } from "react";
import style from "./Header.module.css";
import { Catalog } from "../Catalog/Catalog";
import img from "./image/Trend.jpg";

export const Header = () => {
  const [defaultGender, setDefaultGender] = useState("women");

  const clickHandlerGender = (e) => {
    e.preventDefault();
    const valueButton = e.target.value;
    setDefaultGender(valueButton);
  };

  return (
    <>
      <div className={style.container}>
        <div className={style.containerBtn}>
          <button
            value="women"
            name="gender"
            onClick={clickHandlerGender}
            className={style.btn}
          >
            Women
          </button>

          <button
            value="men"
            name="gender"
            onClick={clickHandlerGender}
            className={style.btn}
          >
            Men
          </button>
        </div>

        <div className={style.logo}>
          <span className={style.logoName}>Fashion Shoes</span>
        </div>
        <div className="Cart">
          <i className="fas fa-shopping-cart"></i>
        </div>
      </div>
      <div>
        <img src={img} alt="trend" className={style.img} />
      </div>
      <Catalog gender={defaultGender} />
    </>
  );
};
