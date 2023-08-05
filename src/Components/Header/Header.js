import { useContext } from "react";
import style from "./Header.module.css";
// import { Catalog } from "../Catalog/Catalog";
import img from "./image/sneaker.png";
import { GenderContext } from "../Context/Context";

export const Header = () => {
  const { currentGender } = useContext(GenderContext);

  const clickHandlerGender = (e) => {
    e.preventDefault();
    const valueButton = e.target.value;
    currentGender(valueButton);
  };

  return (
    <>
      <header >
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
            <span className={style.logoName}>Sneakers</span>
          </div>
          <div className={style.cart}>
            <i className="fas fa-shopping-cart"></i>
          </div>
        </div>
        <div className={style.elementsHeader}>
          <div className={style.elText}>
            <p className={style.text}>
              Effortlessly combine the best of function and fashion for
              greatness in every step
            </p>
          </div>
          <div className={style.elimg}>
            <img src={img} alt="sneaker" className={style.imgHeader} />
          </div>
        </div>
        {/* <Catalog gender={defaultGender} /> */}
      </header>
    </>
  );
};
