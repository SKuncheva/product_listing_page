import style from "./Footer.module.css";

export const Footer = () => {
  return (
    <footer className={style.container}>
      <div className={style.elements}>
        <ul className={style.info}>
          <li>
            <i className="fas fa-home" /> Home
          </li>
          <li>
            <i className="fas fa-envelope" /> Contact Us
          </li>
          <li>
            <i className="fas fa-user-shield" /> Privacy Policy
          </li>
        </ul>
      </div>
    </footer>
  );
};
