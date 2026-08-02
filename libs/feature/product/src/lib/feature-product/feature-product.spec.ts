import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FeatureProduct } from './feature-product';

describe('FeatureProduct', () => {
  let component: FeatureProduct;
  let fixture: ComponentFixture<FeatureProduct>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [FeatureProduct]
    }).compileComponents();

    fixture = TestBed.createComponent(FeatureProduct);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
