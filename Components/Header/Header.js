import { useContext } from "react";
import style from "./Header.module.css";
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
      <header className={style.containerHeader}>
        <div className={style.wrapper}>
          <div className={style.btnMain}>
            <button value="women" name="gender" onClick={clickHandlerGender} className={style.btn}>
              Women
            </button>

            <button value="men" name="gender" onClick={clickHandlerGender} className={style.btn}>
              Men
            </button>
          </div>

          <div className={style.logo}>
            <span className={style.logoText}>Sneakers</span>
            <span className={style.icon}><i className="fas fa-shoe-prints"></i></span>
          </div>
          <div className={style.btn}>
            <i className="fas fa-shopping-cart"></i>
          </div>
        </div>
      </header>
   
    </>
  );
};
